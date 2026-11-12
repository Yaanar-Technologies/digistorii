import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTenantSchemaByCompany } from "@/lib/tenant";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ company: string; orderId: string }> }
) {
  const { company, orderId: rawOrderId } = await params;

  let schema = "";
  try {
    const tenantInfo = await getTenantSchemaByCompany(company);
    schema = tenantInfo.schema;
  } catch {
    return NextResponse.json({ success: false, error: "Storefront tenant not found" }, { status: 404 });
  }

  const client = await pool.connect();

  try {
    const isNumeric = !isNaN(Number(rawOrderId));

    // 1. Fetch public-safe order metadata
    const orderRes = await client.query(
      `SELECT id, order_no, order_status, delivery_status, payment_status, created_at
       FROM "${schema}".online_orders
       WHERE ${isNumeric ? "id = $1 OR order_no = $2" : "order_no = $1"}
       LIMIT 1`,
      isNumeric ? [Number(rawOrderId), rawOrderId] : [rawOrderId]
    );

    if (orderRes.rowCount === 0) {
      return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
    }

    const order = orderRes.rows[0];
    const orderId = Number(order.id);

    // 2. Fetch shipment and delivery tracking
    const deliveryRes = await client.query(
      `SELECT
         id, courier_partner, awb_number, tracking_url, estimated_delivery_at,
         dispatched_at, picked_up_at, out_for_delivery_at, delivered_at,
         last_location, attempt_count, failure_reason
       FROM "${schema}".online_order_deliveries
       WHERE order_id = $1
       ORDER BY id DESC
       LIMIT 1`,
      [orderId]
    );

    const delivery = deliveryRes.rows[0] || null;

    // 3. Fetch chronological audit timeline
    const historyRes = await client.query(
      `SELECT id, status_type, from_status, to_status, note, created_at
       FROM "${schema}".online_order_status_history
       WHERE order_id = $1
       ORDER BY created_at ASC`,
      [orderId]
    );

    const trackingHistory = historyRes.rows.map((h) => ({
      id: h.id,
      status: h.to_status,
      statusType: h.status_type,
      timestamp: h.created_at,
      description: h.note || `Order status updated to ${h.to_status.replace(/_/g, " ")}`,
    }));

    return NextResponse.json({
      success: true,
      tracking: {
        orderId: order.id,
        orderNo: order.order_no,
        orderStatus: order.order_status,
        deliveryStatus: order.delivery_status,
        carrierName: delivery?.courier_partner || "Courier Partner",
        awbNumber: delivery?.awb_number || null,
        trackingUrl: delivery?.tracking_url || null,
        estimatedDeliveryAt: delivery?.estimated_delivery_at || null,
        currentLocation: delivery?.last_location || null,
        dispatchedAt: delivery?.dispatched_at || null,
        deliveredAt: delivery?.delivered_at || null,
        attemptCount: Number(delivery?.attempt_count || 0),
        failureReason: delivery?.failure_reason || null,
        createdAt: order.created_at,
        trackingHistory,
      },
    });
  } catch (err: any) {
    console.error("[Customer Tracking API Error]:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to retrieve tracking details" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

