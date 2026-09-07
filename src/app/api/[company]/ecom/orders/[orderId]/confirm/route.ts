import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTenantSchema, getTenantSchemaByCompany } from "@/lib/tenant";
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
