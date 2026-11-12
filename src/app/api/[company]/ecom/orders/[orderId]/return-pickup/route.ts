import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireStaff, staffDisplayName } from "@/lib/apiGuard";
import { decryptSecret } from "@/lib/cryptoHelper";
import { getCourierAdapter } from "@/lib/couriers";

interface ReturnPickupRequestBody {
  returnId?: number;
  pickupDate?: string;
  adminNotes?: string;
  overrideCourierPartner?: string;
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

    const guard = await requireStaff(req, company, { permission: "ecommerce_access", requireEcom: true });
    if (!guard.ok) return guard.response;

    if (!orderId || isNaN(orderId)) {
      return NextResponse.json(
        { success: false, error: "Invalid order ID provided." },
        { status: 400 }
      );
    }

    let body: ReturnPickupRequestBody = {};
    try {
      body = await req.json();
    } catch { }

    const schema = guard.schema;
    const staffUsername = staffDisplayName(guard.staff);

    await client.query("BEGIN");
    inTransaction = true;

    // 1. Fetch active return request
    let returnQuery = `
      SELECT id, order_id, customer_id, status, return_reason, refund_amount, items
      FROM "${schema}".order_returns
      WHERE order_id = $1
    `;
    const queryParams: any[] = [orderId];

    if (body.returnId) {
      returnQuery += ` AND id = $2`;
      queryParams.push(body.returnId);
    } else {
      returnQuery += ` AND status IN ('requested', 'approved') ORDER BY id DESC LIMIT 1`;
    }

    const returnRes = await client.query(returnQuery, queryParams);
    if (returnRes.rowCount === 0) {
      await client.query("ROLLBACK");
      inTransaction = false;
      return NextResponse.json(
        { success: false, error: "No pending or approved return request found for this order." },
        { status: 404 }
      );
    }

    const returnRecord = returnRes.rows[0];

    // 2. Fetch order with shipping / customer pickup address
    const orderRes = await client.query(
      `SELECT
         o.id, o.order_no, o.order_status, o.customer_id,
         ca.name AS recipient_name, ca.address_line1, ca.address_line2, ca.city, ca.state, ca.pincode, ca.country,
         COALESCE(ca.phone, c.phone, '0000000000') AS phone,
         COALESCE(c.email, 'order@storefront.local') AS email
       FROM "${schema}".online_orders o
       LEFT JOIN "${schema}".customers c ON c.id = o.customer_id
       LEFT JOIN "${schema}".customer_addresses ca ON ca.id = o.shipping_address_id
       WHERE o.id = $1`,
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

    // 3. Load ecom_settings for delivery partner credentials
    const settingsRes = await client.query(
      `SELECT delivery_partner, delivery_api_key_enc, delivery_api_secret_enc
       FROM "${schema}".ecom_settings
       LIMIT 1`
    );

    const ecomSettings = settingsRes.rows[0] || null;
    const deliveryPartner = (
      body.overrideCourierPartner ||
      ecomSettings?.delivery_partner ||
      "self"
    ).trim().toLowerCase();

    const adapter = getCourierAdapter(deliveryPartner);

    let deliveryApiKey: string | undefined = undefined;
    let deliveryApiSecret: string | undefined = undefined;

    if (deliveryPartner !== "self" && ecomSettings?.delivery_api_key_enc && ecomSettings?.delivery_api_secret_enc) {
      try {
        deliveryApiKey = decryptSecret(ecomSettings.delivery_api_key_enc);
        deliveryApiSecret = decryptSecret(ecomSettings.delivery_api_secret_enc);
      } catch (err) {
        console.warn("[Return Pickup] Failed to decrypt delivery API credentials, proceeding with fallback.");
      }
    }

    // 4. Generate reverse pickup via Courier Adapter
    const returnItems = (Array.isArray(returnRecord.items) ? returnRecord.items : []).map(
      (it: any) => ({
        name: it.name || "Returned Item",
        units: Number(it.qty || 1),
        selling_price: Number(it.price || 0),
      })
    );

    let pickupResult;
    try {
      pickupResult = await adapter.generateReturnPickup({
        orderNo: order.order_no,
        returnId: returnRecord.id,
        pickupAddress: {
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
        deliveryApiKey,
        deliveryApiSecret,
        items: returnItems,
        reason: returnRecord.return_reason,
      });
    } catch (courierErr: any) {
      await client.query("ROLLBACK");
      inTransaction = false;
      return NextResponse.json(
        {
          success: false,
          error: `Failed to schedule return pickup with courier (${deliveryPartner}): ${courierErr.message || "Unknown error"}`,
        },
        { status: 400 }
      );
    }

    const scheduledDate = pickupResult.pickupScheduledDate || new Date(Date.now() + 24 * 60 * 60 * 1000);

    // 5. Update order_returns
    await client.query(
      `UPDATE "${schema}".order_returns
       SET status = 'pickup_scheduled',
           return_awb = $1,
           pickup_scheduled_at = $2,
           admin_notes = COALESCE($3, admin_notes),
           updated_at = NOW()
       WHERE id = $4`,
      [pickupResult.returnAwb, scheduledDate, body.adminNotes || null, returnRecord.id]
    );

    // 6. Update online_order_deliveries
    await client.query(
      `UPDATE "${schema}".online_order_deliveries
       SET return_awb = $1,
           return_pickup_scheduled_at = $2,
           updated_at = NOW()
       WHERE order_id = $3`,
      [pickupResult.returnAwb, scheduledDate, orderId]
    );

    // 7. Add internal note and status history
    await client.query(
      `INSERT INTO "${schema}".order_notes (company_id, order_id, author_name, author_type, content, is_customer_visible, created_at)
       SELECT company_id, id, $1, 'staff',
              'Return pickup approved and scheduled via ' || $2 || '. Return AWB: ' || $3 || ', Scheduled Date: ' || $4,
              true, NOW()
       FROM "${schema}".online_orders
       WHERE id = $5`,
      [
        staffUsername,
        pickupResult.courierName || deliveryPartner,
        pickupResult.returnAwb,
        scheduledDate.toLocaleDateString("en-US"),
        orderId,
      ]
    );

    await client.query(
      `INSERT INTO "${schema}".online_order_status_history
         (order_id, status_type, from_status, to_status, changed_by, note, created_at)
       VALUES ($1, 'delivery', 'return_requested', 'pickup_scheduled', $2, $3, NOW())`,
      [
        orderId,
        staffUsername,
        `Return pickup scheduled with ${pickupResult.courierName || deliveryPartner}. AWB: ${pickupResult.returnAwb}`,
      ]
    );

    await client.query("COMMIT");
    inTransaction = false;

    return NextResponse.json({
      success: true,
      message: "Return pickup successfully scheduled.",
      return_id: returnRecord.id,
      return_awb: pickupResult.returnAwb,
      pickup_scheduled_at: scheduledDate,
      courier_name: pickupResult.courierName || deliveryPartner,
      tracking_url: pickupResult.trackingUrl || null,
    });
  } catch (err: any) {
    if (inTransaction) {
      await client.query("ROLLBACK");
    }
    console.error("[Schedule Return Pickup Error]:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to schedule return pickup." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

