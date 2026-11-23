import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getStorefrontCustomerSession } from "@/lib/storefrontAuth";
import { transitionOrderStatus } from "@/lib/orderStateMachine";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ company: string; orderId: string }> }
) {
  const { company, orderId: rawOrderId } = await params;
  const orderId = Number(rawOrderId);

  if (!orderId || isNaN(orderId)) {
    return NextResponse.json(
      { success: false, error: "Invalid order ID provided." },
      { status: 400 }
    );
  }

  // 1. Authenticate customer
  const session = await getStorefrontCustomerSession(req, company);
  if (!session?.customerId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized: sign in required." },
      { status: 401 }
    );
  }

  let reason = "Cancelled by customer";
  try {
    const body = await req.json();
    if (body?.reason && typeof body.reason === "string" && body.reason.trim()) {
      reason = body.reason.trim();
    }
  } catch {
    // Body is optional
  }

  const client = await pool.connect();
  try {
    const schema = session.schema;

    await client.query("BEGIN");

    // 2. Fetch order and verify ownership & eligibility
    const orderRes = await client.query(
      `SELECT id, customer_id, order_status, delivery_status, order_no
       FROM "${schema}".online_orders
       WHERE id = $1 AND customer_id = $2
       LIMIT 1
       FOR UPDATE`,
      [orderId, session.customerId]
    );

    if (orderRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { success: false, error: `Order #${orderId} not found or unauthorized.` },
        { status: 404 }
      );
    }

    const order = orderRes.rows[0];

    if (!["placed", "confirmed"].includes(order.order_status)) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          success: false,
          error: `Order cannot be cancelled because it is already '${order.order_status}'. Please contact customer support.`,
        },
        { status: 400 }
      );
    }

    // 3. Transition to cancelled
    await transitionOrderStatus(client, schema, orderId, "cancelled", {
      changedBy: `customer:${session.customerId}`,
      note: `Customer cancellation requested. Reason: ${reason}`,
    });

    // 4. Release item reservations
    await client.query(
      `UPDATE "${schema}".online_order_items
       SET fulfillment_status = 'cancelled'
       WHERE order_id = $1`,
      [orderId]
    );

    // Release stock reservations if active
    await client.query(
      `DELETE FROM "${schema}".stock_reservations
       WHERE ref_type = 'online_order' AND ref_id = $1`,
      [orderId]
    ).catch(() => {});

    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      message: `Order #${order.order_no} has been cancelled successfully.`,
      orderId,
      orderStatus: "cancelled",
    });
  } catch (err: any) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[Customer Order Cancel API] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to cancel order." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
