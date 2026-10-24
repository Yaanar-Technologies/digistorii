import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireStaff, staffDisplayName } from "@/lib/apiGuard";
import { transitionOrderStatus, OrderTransitionError } from "@/lib/orderStateMachine";

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

    const schema = guard.schema;
    const staffUsername = staffDisplayName(guard.staff);

    await client.query("BEGIN");
    inTransaction = true;

    // Load order with lock
    const orderRes = await client.query(
      `SELECT id, order_no, order_status, payment_status, payment_method
       FROM "${schema}".online_orders
       WHERE id = $1
       FOR UPDATE`,
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

    if (order.order_status !== "placed") {
      await client.query("ROLLBACK");
      inTransaction = false;
      return NextResponse.json(
        {
          success: false,
          error: `Cannot confirm order #${orderId}. Current status is '${order.order_status}' (expected 'placed').`,
        },
        { status: 400 }
      );
    }

    const isPaid = order.payment_status === "paid";
    const isCod = order.payment_method === "cod";

    if (!isPaid && !isCod) {
      await client.query("ROLLBACK");
      inTransaction = false;
      return NextResponse.json(
        {
          success: false,
          error: `Cannot confirm order #${orderId}. Order must be paid or placed with Cash on Delivery (payment_status: '${order.payment_status}', payment_method: '${order.payment_method}').`,
        },
        { status: 400 }
      );
    }

    // Execute state transition
    await transitionOrderStatus(client, schema, orderId, "confirmed", {
      changedBy: staffUsername,
      note: "Order confirmed by staff",
    });

    await client.query("COMMIT");
    inTransaction = false;

    return NextResponse.json({
      success: true,
      message: `Order #${order.order_no} confirmed successfully.`,
      order_id: orderId,
      order_status: "confirmed",
    });
  } catch (err: any) {
    if (inTransaction) {
      await client.query("ROLLBACK");
    }
    if (err instanceof OrderTransitionError || err.name === "OrderTransitionError") {
      return NextResponse.json({ success: false, error: err.message }, { status: 409 });
    }
    console.error("[Confirm Order Route Error]:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to confirm order." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
