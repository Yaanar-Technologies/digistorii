import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireStaff, staffDisplayName } from "@/lib/apiGuard";
import { transitionOrderStatus, OrderTransitionError } from "@/lib/orderStateMachine";

export interface BulkPackResultItem {
  orderId: number;
  orderNo: string;
  success: boolean;
  message?: string;
  error?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  const { company } = await params;

  const guard = await requireStaff(req, company, { permission: "ecommerce_access", requireEcom: true });
  if (!guard.ok) return guard.response;

  const schema = guard.schema;
  const staffUsername = staffDisplayName(guard.staff);

  let body: { orderIds?: (number | string)[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body provided." }, { status: 400 });
  }

  const rawOrderIds = body.orderIds;
  if (!Array.isArray(rawOrderIds) || rawOrderIds.length === 0) {
    return NextResponse.json(
      { success: false, error: "orderIds array must be provided and non-empty." },
      { status: 400 }
    );
  }

  const numericOrderIds = rawOrderIds
    .map((id) => Number(id))
    .filter((id) => !isNaN(id) && id > 0);

  if (numericOrderIds.length === 0) {
    return NextResponse.json(
      { success: false, error: "No valid numeric order IDs provided." },
      { status: 400 }
    );
  }

  const client = await pool.connect();
  const results: BulkPackResultItem[] = [];

  try {
    for (const orderId of numericOrderIds) {
      try {
        await client.query("BEGIN");

        const orderRes = await client.query(
          `SELECT id, order_no, order_status, payment_status, payment_method, delivery_status
           FROM "${schema}".online_orders
           WHERE id = $1
           FOR UPDATE`,
          [orderId]
        );

        if (orderRes.rowCount === 0) {
          await client.query("ROLLBACK");
          results.push({
            orderId,
            orderNo: "",
            success: false,
            error: `Order #${orderId} not found.`,
          });
          continue;
        }

        const order = orderRes.rows[0];

        if (order.order_status === "packed") {
          await client.query("COMMIT");
          results.push({
            orderId,
            orderNo: order.order_no,
            success: true,
            message: "Order is already packed.",
          });
          continue;
        }

        if (["shipped", "out_for_delivery", "delivered"].includes(order.order_status)) {
          await client.query("COMMIT");
          results.push({
            orderId,
            orderNo: order.order_no,
            success: true,
            message: `Order is already dispatched (${order.order_status}).`,
          });
          continue;
        }

        if (["cancelled", "returned", "refunded"].includes(order.order_status)) {
          await client.query("ROLLBACK");
          results.push({
            orderId,
            orderNo: order.order_no,
            success: false,
            error: `Cannot pack order with status '${order.order_status}'.`,
          });
          continue;
        }

        // If placed, advance to confirmed first
        if (order.order_status === "placed") {
          await transitionOrderStatus(client, schema, orderId, "confirmed", {
            changedBy: staffUsername,
            note: "Auto-confirmed prior to packing",
          });
        }

        // Auto-allocate all pending/reserved line items
        await client.query(
          `UPDATE "${schema}".online_order_items
           SET fulfillment_status = 'allocated'
           WHERE order_id = $1 AND fulfillment_status IN ('pending', 'reserved')`,
          [orderId]
        );

        // Transition confirmed -> packed
        await transitionOrderStatus(client, schema, orderId, "packed", {
          changedBy: staffUsername,
          note: "Marked as packed via bulk action",
        });

        await client.query("COMMIT");

        results.push({
          orderId,
          orderNo: order.order_no,
          success: true,
          message: "Order packed successfully.",
        });
      } catch (orderErr: any) {
        await client.query("ROLLBACK").catch(() => {});
        results.push({
          orderId,
          orderNo: "",
          success: false,
          error: orderErr.message || "Failed to pack order",
        });
      }
    }

    const successfulCount = results.filter((r) => r.success).length;
    const failedCount = results.filter((r) => !r.success).length;

    return NextResponse.json({
      success: true,
      total: numericOrderIds.length,
      successful: successfulCount,
      failed: failedCount,
      results,
    });
  } catch (err: any) {
    console.error("[Bulk Pack API] Unexpected error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Internal server error during bulk packing." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
