import { PoolClient } from "pg";
import { pool } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { getCourierAdapter } from "@/lib/couriers";
import {
  transitionOrderStatus,
  transitionDeliveryStatus,
  OrderTransitionError,
} from "@/lib/orderStateMachine";

export interface AutoFulfillOptions {
  trigger?: "webhook:razorpay" | "checkout:cod" | "manual" | string;
  note?: string;
}

export interface AutoFulfillResult {
  success: boolean;
  orderId: number;
  orderNo: string;
  orderStatus: string;
  deliveryStatus?: string;
  courierPartner?: string;
  awbNumber?: string;
  trackingUrl?: string;
  shippingLabelUrl?: string;
  error?: string;
}

/**
 * Asynchronous Order Fulfillment Pipeline Orchestrator.
 *
 * Implements the Zero-Touch Fulfillment Loop:
 * 1. Checks order confirmation eligibility (paid or approved COD).
 * 2. Auto-allocates inventory lines (`online_order_items.fulfillment_status = 'allocated'`).
 * 3. Advances order state to 'packed'.
 * 4. Checks tenant courier configuration:
 *    - If automated (e.g., Shiprocket / Delhivery): transmits package payload, generates AWB,
 *      stores shipment details, advances state to 'shipped' (and delivery to 'picked_up'),
 *      fetches label, and emits `ORDER_AUTO_DISPATCHED` socket event.
 *    - If manual / self-delivery: leaves order in 'packed' with items allocated for staff dispatch.
 */
export async function autoFulfillOrder(
  schema: string,
  orderId: number,
  options?: AutoFulfillOptions
): Promise<AutoFulfillResult> {
  const client: PoolClient = await pool.connect();
  const trigger = options?.trigger || "system:auto_fulfill";

  try {
    await client.query("BEGIN");

    // 1. Lock and load order
    const orderRes = await client.query(
      `SELECT
         o.id, o.order_no, o.order_status, o.payment_status, o.payment_method,
         o.delivery_status, o.total_amount, o.subtotal, o.shipping_address_id, o.customer_id,
         ca.recipient_name, ca.address_line1, ca.address_line2, ca.city, ca.state,
         ca.pincode, ca.country,
         COALESCE(ca.recipient_phone, c.phone, '0000000000') AS phone,
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
      return {
        success: false,
        orderId,
        orderNo: "",
        orderStatus: "not_found",
        error: `Order #${orderId} not found in schema '${schema}'.`,
      };
    }

    const order = orderRes.rows[0];
    const orderNo = order.order_no;

    // Check terminal or incompatible states
    if (["shipped", "out_for_delivery", "delivered", "cancelled", "returned", "refunded"].includes(order.order_status)) {
      await client.query("COMMIT");
      return {
        success: true,
        orderId,
        orderNo,
        orderStatus: order.order_status,
        deliveryStatus: order.delivery_status,
      };
    }

    // 2. Advance placed -> confirmed if paid or COD
    if (order.order_status === "placed") {
      const isPaid = order.payment_status === "paid";
      const isCod = order.payment_method === "cod";

      if (!isPaid && !isCod) {
        await client.query("COMMIT");
        return {
          success: false,
          orderId,
          orderNo,
          orderStatus: order.order_status,
          error: "Order is not paid or COD. Auto-fulfillment withheld.",
        };
      }

      await transitionOrderStatus(client, schema, orderId, "confirmed", {
        changedBy: trigger,
        note: options?.note || "Auto-confirmed for fulfillment pipeline",
      });
    }

    // 3. Auto-Allocation: Ensure all items are allocated
    await client.query(
      `UPDATE "${schema}".online_order_items
       SET fulfillment_status = 'allocated'
       WHERE order_id = $1 AND fulfillment_status IN ('pending', 'reserved')`,
      [orderId]
    );

    // 4. Advance confirmed -> packed
    const currentOrderRes = await client.query(
      `SELECT order_status FROM "${schema}".online_orders WHERE id = $1`,
      [orderId]
    );
    if (currentOrderRes.rows[0]?.order_status === "confirmed") {
      await transitionOrderStatus(client, schema, orderId, "packed", {
        changedBy: trigger,
        note: "Auto-allocated line items & packed by orchestrator",
      });
    }

    // 5. Check Tenant Logistics Settings
    const settingsRes = await client.query(
      `SELECT delivery_partner, delivery_api_key_enc, delivery_api_secret_enc, pickup_location_code
       FROM "${schema}".ecom_settings
       LIMIT 1`
    );

    const ecomSettings = settingsRes.rows[0] || null;
    const deliveryPartner = (ecomSettings?.delivery_partner || "self").trim().toLowerCase();

    // Case A: Manual / Self delivery partner
    if (deliveryPartner === "self" || !deliveryPartner) {
      await client.query("COMMIT");

      // Record note for merchant staff
      await client.query(
        `INSERT INTO "${schema}".online_order_status_history
           (order_id, status_type, from_status, to_status, changed_by, note, created_at)
         VALUES ($1, 'order', 'confirmed', 'packed', $2, 'Order packed and items allocated. Awaiting staff manual shipment.', NOW())`,
        [orderId, trigger]
      );

      return {
        success: true,
        orderId,
        orderNo,
        orderStatus: "packed",
        deliveryStatus: "not_shipped",
        courierPartner: "Self Delivery",
      };
    }

    // Case B: Automated Logistics Partner (Shiprocket, Delhivery, etc.)
    const apiKeyEnc = ecomSettings?.delivery_api_key_enc;
    const apiSecretEnc = ecomSettings?.delivery_api_secret_enc;

    if (!apiKeyEnc) {
      await client.query("COMMIT");
      console.warn(`[AutoFulfill] Missing courier API credentials for partner '${deliveryPartner}'. Order #${orderId} kept in 'packed'.`);
      return {
        success: true,
        orderId,
        orderNo,
        orderStatus: "packed",
        deliveryStatus: "not_shipped",
        error: `API credentials for courier partner '${deliveryPartner}' not configured. Order packed for manual shipment.`,
      };
    }

    let deliveryApiKey = "";
    let deliveryApiSecret = "";
    try {
      deliveryApiKey = decryptSecret(apiKeyEnc);
      if (apiSecretEnc) {
        deliveryApiSecret = decryptSecret(apiSecretEnc);
      }
    } catch (decryptErr) {
      console.error(`[AutoFulfill] Failed to decrypt courier secrets for company schema '${schema}':`, decryptErr);
      await client.query("COMMIT");
      return {
        success: false,
        orderId,
        orderNo,
        orderStatus: "packed",
        error: "Failed to decrypt courier API credentials.",
      };
    }

    // Fetch order line items
    const itemsRes = await client.query(
      `SELECT
         oi.product_name AS name,
         oi.qty AS units,
         oi.rate AS selling_price,
         oi.discount,
         oi.tax_amount AS tax,
         oi.hsn_no AS hsn,
         COALESCE(pv.sku, oi.product_name) AS sku
       FROM "${schema}".online_order_items oi
       LEFT JOIN "${schema}".product_variants pv ON pv.id = oi.variant_id
       WHERE oi.order_id = $1`,
      [orderId]
    );

    const adapter = getCourierAdapter(deliveryPartner);

    const shipmentResult = await adapter.createShipment({
      orderNo: order.order_no,
      orderDate: new Date(),
      items: itemsRes.rows.map((row) => ({
        name: row.name,
        sku: row.sku || row.name,
        units: Number(row.units || 1),
        selling_price: Number(row.selling_price || 0),
        discount: Number(row.discount || 0),
        tax: Number(row.tax || 0),
        hsn: row.hsn || "",
      })),
      shippingAddress: {
        name: order.recipient_name || "Customer",
        address_line1: order.address_line1 || "Customer Address",
        address_line2: order.address_line2 || "",
        city: order.city || "City",
        state: order.state || "State",
        pincode: order.pincode || "000000",
        country: order.country || "India",
        phone: order.phone || "0000000000",
        email: order.email || "order@storefront.local",
      },
      pickupLocationCode: ecomSettings?.pickup_location_code || "Primary",
      codAmount: order.payment_method === "cod" ? Number(order.total_amount) : 0,
      subtotal: Number(order.subtotal || order.total_amount),
      totalAmount: Number(order.total_amount),
      deliveryApiKey,
      deliveryApiSecret,
    });

    const finalAwb = shipmentResult.awbNumber;
    const finalTrackingUrl = shipmentResult.trackingUrl || `https://track.courier/${finalAwb}`;
    const finalCourier = shipmentResult.courierName || deliveryPartner;
    const finalLabelUrl = shipmentResult.shippingLabelUrl || null;

    // Persist delivery record
    await client.query(
      `INSERT INTO "${schema}".online_order_deliveries (
         order_id, courier_partner, awb_number, tracking_url, shipping_label_url,
         dispatched_at, pickup_scheduled_at, estimated_delivery_at, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), $6, NOW(), NOW())
       ON CONFLICT (order_id) DO UPDATE
       SET courier_partner = EXCLUDED.courier_partner,
           awb_number = EXCLUDED.awb_number,
           tracking_url = EXCLUDED.tracking_url,
           shipping_label_url = COALESCE(EXCLUDED.shipping_label_url, "${schema}".online_order_deliveries.shipping_label_url),
           dispatched_at = COALESCE("${schema}".online_order_deliveries.dispatched_at, NOW()),
           pickup_scheduled_at = NOW(),
           estimated_delivery_at = EXCLUDED.estimated_delivery_at,
           updated_at = NOW()`,
      [
        orderId,
        finalCourier,
        finalAwb,
        finalTrackingUrl,
        finalLabelUrl,
        shipmentResult.estimatedDeliveryAt || null,
      ]
    );

    // Transition packed -> shipped
    await transitionOrderStatus(client, schema, orderId, "shipped", {
      changedBy: trigger,
      note: `Auto-dispatched via ${finalCourier} (AWB: ${finalAwb})`,
    });

    // Transition delivery_status not_shipped -> picked_up
    await transitionDeliveryStatus(client, schema, orderId, "picked_up", {
      changedBy: trigger,
      note: `Shipment registered with ${finalCourier}`,
    });

    await client.query("COMMIT");

    // Real-time Workspace Socket Emission
    try {
      const io = (global as any).io;
      if (io) {
        io.emit("ORDER_AUTO_DISPATCHED", {
          orderId,
          orderNo: order.order_no,
          courierPartner: finalCourier,
          awbNumber: finalAwb,
          trackingUrl: finalTrackingUrl,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (sockErr) {
      console.warn("[AutoFulfill] Socket emission notice:", sockErr);
    }

    return {
      success: true,
      orderId,
      orderNo: order.order_no,
      orderStatus: "shipped",
      deliveryStatus: "picked_up",
      courierPartner: finalCourier,
      awbNumber: finalAwb,
      trackingUrl: finalTrackingUrl,
      shippingLabelUrl: finalLabelUrl || undefined,
    };
  } catch (err: any) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`[AutoFulfill] Error fulfilling order #${orderId} for schema '${schema}':`, err);

    // Attempt to log critical operational alert if dispatch failed
    try {
      await pool.query(
        `INSERT INTO "${schema}".admin_operational_alerts (
           alert_type, severity, title, message, payload, is_resolved, created_at
         )
         VALUES ('DISPATCH_FAILURE', 'WARNING', $1, $2, $3, FALSE, NOW())`,
        [
          `Auto-Fulfillment Notice for Order #${orderId}`,
          `Failed during courier dispatch: ${err.message || String(err)}. Order kept in current status for manual review.`,
          JSON.stringify({ orderId, error: err.message || String(err) }),
        ]
      );
    } catch {}

    return {
      success: false,
      orderId,
      orderNo: "",
      orderStatus: "error",
      error: err.message || "Auto-fulfillment failed.",
    };
  } finally {
    client.release();
  }
}

