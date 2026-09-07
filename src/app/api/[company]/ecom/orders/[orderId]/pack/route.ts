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
