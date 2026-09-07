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

interface CancelRequestBody {
  reason?: string;
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

    let body: CancelRequestBody = {};
    try {
      body = await req.json();
    } catch {}

    const reason = body.reason?.trim() || "Cancelled by staff";

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

    // Call state machine transition to 'cancelled'
    // State machine validates adjacency rules, releases held reservations, and records audit history
    await transitionOrderStatus(client, schema, orderId, "cancelled", {
      changedBy: staffUsername,
      note: reason,
    });

    await client.query("COMMIT");
    inTransaction = false;

    return NextResponse.json({
      success: true,
      message: `Order #${orderId} cancelled successfully.`,
      order_id: orderId,
      order_status: "cancelled",
      reason,
    });
  } catch (err: any) {
    if (inTransaction) {
      await client.query("ROLLBACK");
    }
    if (err instanceof OrderTransitionError || err.name === "OrderTransitionError") {
      return NextResponse.json({ success: false, error: err.message }, { status: 409 });
    }
    console.error("[Cancel Order Route Error]:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to cancel order." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
