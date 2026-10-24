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

    // Call state machine transition to 'packed'
    // State machine validates that order is 'confirmed' and all items are 'allocated'
    await transitionOrderStatus(client, schema, orderId, "packed", {
      changedBy: staffUsername,
      note: "Order packed by staff",
    });

    await client.query("COMMIT");
    inTransaction = false;

    return NextResponse.json({
      success: true,
      message: `Order #${orderId} marked as packed successfully.`,
      order_id: orderId,
      order_status: "packed",
    });
  } catch (err: any) {
    if (inTransaction) {
      await client.query("ROLLBACK");
    }
    if (err instanceof OrderTransitionError || err.name === "OrderTransitionError") {
      return NextResponse.json({ success: false, error: err.message }, { status: 409 });
    }
    console.error("[Pack Order Route Error]:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to pack order." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
