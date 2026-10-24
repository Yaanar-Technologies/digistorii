import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireStaff, staffDisplayName } from "@/lib/apiGuard";
import { transitionDeliveryStatus, OrderTransitionError } from "@/lib/orderStateMachine";

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

    // Verify order exists and is in shipped / out_for_delivery status
    const orderRes = await client.query(
      `SELECT id, order_no, order_status, delivery_status
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

    if (order.order_status !== "shipped" && order.order_status !== "out_for_delivery") {
      await client.query("ROLLBACK");
      inTransaction = false;
      return NextResponse.json(
        {
          success: false,
          error: `Cannot mark order #${orderId} delivered. Order status must be 'shipped' or 'out_for_delivery' (currently '${order.order_status}').`,
        },
        { status: 400 }
      );
    }

    // Update online_order_deliveries timestamp
    await client.query(
      `UPDATE "${schema}".online_order_deliveries
       SET delivered_at = NOW(),
           updated_at = NOW()
       WHERE order_id = $1`,
      [orderId]
    );

    // Call transitionDeliveryStatus which chains to transitionOrderStatus('delivered')
    await transitionDeliveryStatus(client, schema, orderId, "delivered", {
      changedBy: staffUsername,
      note: "Marked delivered via staff override",
    });

    await client.query("COMMIT");
    inTransaction = false;

    return NextResponse.json({
      success: true,
      message: `Order #${order.order_no} marked as delivered successfully.`,
      order_id: orderId,
      delivery_status: "delivered",
      order_status: "delivered",
    });
  } catch (err: any) {
    if (inTransaction) {
      await client.query("ROLLBACK");
    }
    if (err instanceof OrderTransitionError || err.name === "OrderTransitionError") {
      return NextResponse.json({ success: false, error: err.message }, { status: 409 });
    }
    console.error("[Mark Delivered Order Route Error]:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to mark order delivered." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
