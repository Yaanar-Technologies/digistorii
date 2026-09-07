import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTenantSchema, getTenantSchemaByCompany } from "@/lib/tenant";
import { decryptSecret } from "@/lib/cryptoHelper";
import { getCourierAdapter } from "@/lib/couriers";
import { transitionOrderStatus, OrderTransitionError } from "@/lib/orderStateMachine";

function getStaffUsername(req: NextRequest): string {
  const userCookie = req.cookies.get("user")?.value;
  if (userCookie) {
    try {
      const parsed = JSON.parse(userCookie);
      return parsed?.username || parsed?.email || parsed?.name || `user:${parsed?.id}` || "staff";
    } catch {}
  }
  return req.headers.get("x-user-name") || "staff";
}

interface ShipRequestBody {
  awbNumber?: string;
  trackingUrl?: string;
  courierPartner?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ company: string; orderId: string }> }
) {
  const client = await pool.connect();
  let inTransaction = false;

  try {
    const { company, orderId: rawOrderId } = await params;
    const orderId = Number(rawOrderId);

    if (!orderId || isNaN(orderId)) {
      return NextResponse.json(
        { success: false, error: "Invalid order ID provided." },
        { status: 400 }
      );
    }

    let body: ShipRequestBody = {};
    try {
      body = await req.json();
    } catch {}

    let schema = "";
    try {
      const tenantInfo = await getTenantSchema(req);
      schema = tenantInfo.schema;
    } catch {
      const tenantInfo = await getTenantSchemaByCompany(company);
      schema = tenantInfo.schema;
    }

    const staffUsername = getStaffUsername(req);

    await client.query("BEGIN");
    inTransaction = true;

    // Load order with shipping address
    const orderRes = await client.query(
      `SELECT
         o.id, o.order_no, o.order_status, o.payment_method, o.total_amount, o.subtotal,
         o.shipping_address_id, o.customer_id,
         ca.name AS recipient_name, ca.address_line1, ca.address_line2, ca.city, ca.state, ca.pincode, ca.country,
         COALESCE(ca.phone, c.phone, '0000000000') AS phone,
         COALESCE(c.email, 'order@storefront.local') AS email
       FROM "${schema}".online_orders o
       LEFT JOIN "${schema}".customers c ON c.id = o.customer_id
       LEFT JOIN "${schema}".customer_addresses ca ON ca.id = o.shipping_address_id
       WHERE o.id = $1
       FOR UPDATE OF o`,
      [orderId]
    );

    if (orderRes.rowCount === 0) {
      await client.query("ROLLBACK");
      inTransaction = false;
      return NextResponse.json(
        { success: false, error: `Order #${orderId} not found.` },
        { status: 404 }
      );
    }

    const order = orderRes.rows[0];

    if (order.order_status !== "packed") {
      await client.query("ROLLBACK");
      inTransaction = false;
      return NextResponse.json(
        {
          success: false,
          error: `Cannot ship order #${orderId}. Order status must be 'packed' (currently '${order.order_status}').`,
        },
        { status: 400 }
      );
    }

    // Load ecom_settings
    const settingsRes = await client.query(
      `SELECT delivery_partner, delivery_api_key_enc, delivery_api_secret_enc, pickup_location_code
       FROM "${schema}".ecom_settings
       LIMIT 1`
    );

    const ecomSettings = settingsRes.rows[0] || null;
    const deliveryPartner = (ecomSettings?.delivery_partner || "").trim().toLowerCase();

    let finalAwb = body.awbNumber || null;
    let finalTrackingUrl = body.trackingUrl || null;
    let finalCourier = body.courierPartner || deliveryPartner || "Self Delivery";
    let finalEstimatedDelivery: Date | null = null;

    if (deliveryPartner === "self" || !deliveryPartner) {
      // Manual / Self Delivery Path
      await client.query(
        `INSERT INTO "${schema}".online_order_deliveries (
           order_id, courier_partner, awb_number, tracking_url, pickup_scheduled_at, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, NOW(), NOW(), NOW())
         ON CONFLICT (order_id) DO UPDATE
         SET courier_partner = EXCLUDED.courier_partner,
             awb_number = COALESCE(EXCLUDED.awb_number, "${schema}".online_order_deliveries.awb_number),
             tracking_url = COALESCE(EXCLUDED.tracking_url, "${schema}".online_order_deliveries.tracking_url),
             pickup_scheduled_at = NOW(),
             updated_at = NOW()`,
        [orderId, finalCourier, finalAwb, finalTrackingUrl]
      );

      await transitionOrderStatus(client, schema, orderId, "shipped", {
        changedBy: staffUsername,
        note: `Order shipped via self/manual delivery${finalAwb ? ` (AWB/Ref: ${finalAwb})` : ""}`,
      });
    } else {
      // Automated Courier API Path (e.g. Shiprocket)
      const adapter = getCourierAdapter(deliveryPartner);

      const apiKeyEnc = ecomSettings?.delivery_api_key_enc;
      const apiSecretEnc = ecomSettings?.delivery_api_secret_enc;

      if (!apiKeyEnc || !apiSecretEnc) {
        await client.query("ROLLBACK");
        inTransaction = false;
        return NextResponse.json(
          {
            success: false,
            error: `API credentials for courier partner '${deliveryPartner}' are not configured in store settings.`,
          },
          { status: 400 }
        );
      }

      let deliveryApiKey = "";
      let deliveryApiSecret = "";
      try {
        deliveryApiKey = decryptSecret(apiKeyEnc);
        deliveryApiSecret = decryptSecret(apiSecretEnc);
      } catch (decryptErr) {
        await client.query("ROLLBACK");
        inTransaction = false;
        return NextResponse.json(
          {
            success: false,
            error: "Failed to decrypt courier API credentials.",
          },
          { status: 400 }
        );
      }

      // Fetch order items
      const itemsRes = await client.query(
        `SELECT
           pv.id AS variant_id,
           COALESCE(oi.product_name, pv.variant_name, 'Product') AS name,
           oi.qty AS units,
           oi.rate AS selling_price,
           oi.discount,
           oi.tax_amount AS tax,
           oi.hsn_no AS hsn
         FROM "${schema}".online_order_items oi
         LEFT JOIN "${schema}".product_variants pv ON pv.id = oi.variant_id
         WHERE oi.order_id = $1`,
        [orderId]
      );

      const shipmentItems = itemsRes.rows.map((row) => ({
        name: row.name,
        units: Number(row.units || 1),
        selling_price: Number(row.selling_price || 0),
        discount: Number(row.discount || 0),
        tax: Number(row.tax || 0),
        hsn: row.hsn || undefined,
      }));

      const isCod = order.payment_method === "cod";

      let shipmentResult;
      try {
        shipmentResult = await adapter.createShipment({
          orderNo: order.order_no,
          items: shipmentItems,
          shippingAddress: {
            name: order.recipient_name || "Customer",
            address_line1: order.address_line1 || "Customer Address",
            address_line2: order.address_line2 || undefined,
            city: order.city || "City",
            state: order.state || "State",
            pincode: order.pincode || "000000",
            country: order.country || "India",
            phone: order.phone || "0000000000",
            email: order.email || "order@storefront.local",
          },
          pickupLocationCode: ecomSettings?.pickup_location_code || undefined,
          codAmount: isCod ? Number(order.total_amount) : 0,
          subtotal: Number(order.subtotal || order.total_amount),
          totalAmount: Number(order.total_amount),
          deliveryApiKey,
          deliveryApiSecret,
        });
      } catch (courierErr: any) {
        // On courier API failure, do NOT transition status
        await client.query("ROLLBACK");
        inTransaction = false;
        return NextResponse.json(
          {
            success: false,
            error: `Courier API error (${deliveryPartner}): ${courierErr.message || "Failed to create shipment"}`,
          },
          { status: 400 }
        );
      }

      finalAwb = shipmentResult.awbNumber;
      finalTrackingUrl = shipmentResult.trackingUrl || null;
      finalCourier = shipmentResult.courierName || deliveryPartner;
      finalEstimatedDelivery = shipmentResult.estimatedDeliveryAt || null;

      // Upsert online_order_deliveries
      await client.query(
        `INSERT INTO "${schema}".online_order_deliveries (
           order_id, courier_partner, awb_number, tracking_url, estimated_delivery_at, pickup_scheduled_at, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), NOW())
         ON CONFLICT (order_id) DO UPDATE
         SET courier_partner = EXCLUDED.courier_partner,
             awb_number = EXCLUDED.awb_number,
             tracking_url = EXCLUDED.tracking_url,
             estimated_delivery_at = EXCLUDED.estimated_delivery_at,
             pickup_scheduled_at = NOW(),
             updated_at = NOW()`,
        [orderId, finalCourier, finalAwb, finalTrackingUrl, finalEstimatedDelivery]
      );

      await transitionOrderStatus(client, schema, orderId, "shipped", {
        changedBy: staffUsername,
        note: `Shipment created with ${finalCourier} (AWB: ${finalAwb})`,
      });
    }

    await client.query("COMMIT");
    inTransaction = false;

    return NextResponse.json({
      success: true,
      message: `Order #${order.order_no} marked as shipped.`,
      order_id: orderId,
      order_status: "shipped",
      courier_partner: finalCourier,
      awb_number: finalAwb,
      tracking_url: finalTrackingUrl,
      estimated_delivery_at: finalEstimatedDelivery,
    });
  } catch (err: any) {
    if (inTransaction) {
      await client.query("ROLLBACK");
    }
    if (err instanceof OrderTransitionError || err.name === "OrderTransitionError") {
      return NextResponse.json({ success: false, error: err.message }, { status: 409 });
    }
    console.error("[Ship Order Route Error]:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to ship order." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
