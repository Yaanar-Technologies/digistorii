import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTenantSchema, getTenantSchemaByCompany } from "@/lib/tenant";
import { OrderTransitionError } from "@/lib/orderStateMachine";

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

    // Load and lock order
    const orderRes = await client.query(
      `SELECT id, order_no, order_status
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

    if (order.order_status !== "confirmed") {
      await client.query("ROLLBACK");
      inTransaction = false;
      return NextResponse.json(
        {
          success: false,
          error: `Cannot allocate items for order #${orderId}. Order status must be 'confirmed' (currently '${order.order_status}').`,
        },
        { status: 400 }
      );
    }

    // Update all online_order_items to 'allocated'
    const updateItemsRes = await client.query(
      `UPDATE "${schema}".online_order_items
       SET fulfillment_status = 'allocated'
       WHERE order_id = $1
       RETURNING id`,
      [orderId]
    );

    // Insert status history entry documenting picking/allocation
    await client.query(
      `INSERT INTO "${schema}".online_order_status_history
         (order_id, status_type, from_status, to_status, changed_by, note, created_at)
       VALUES ($1, 'order', 'confirmed', 'confirmed', $2, 'Staff physically picked and allocated line items', NOW())`,
      [orderId, staffUsername]
    );

    await client.query("COMMIT");
    inTransaction = false;

    return NextResponse.json({
      success: true,
      message: `All line items (${updateItemsRes.rowCount}) allocated successfully for order #${order.order_no}.`,
      order_id: orderId,
      allocated_items_count: updateItemsRes.rowCount,
      fulfillment_status: "allocated",
    });
  } catch (err: any) {
    if (inTransaction) {
      await client.query("ROLLBACK");
    }
    if (err instanceof OrderTransitionError || err.name === "OrderTransitionError") {
      return NextResponse.json({ success: false, error: err.message }, { status: 409 });
    }
    console.error("[Allocate Order Route Error]:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to allocate order items." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
