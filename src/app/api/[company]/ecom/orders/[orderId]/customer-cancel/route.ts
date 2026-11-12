import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTenantSchema, getTenantSchemaByCompany } from "@/lib/tenant";
import { getStorefrontCustomerSession } from "@/lib/storefrontAuth";
import { transitionOrderStatus } from "@/lib/orderStateMachine";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ company: string; orderId: string }> }
) {
  const client = await pool.connect();

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

    // 1. Authenticate customer
    const customerSession = await getStorefrontCustomerSession(req, schema);
    if (!customerSession?.customerId) {
      return NextResponse.json(
        { success: false, error: "Authentication required to cancel order." },
        { status: 401 }
      );
    }

    // 2. Parse body for cancellation reason
    let reason = "Cancelled by customer";
    try {
      const body = await req.json();
      if (body?.reason && typeof body.reason === "string" && body.reason.trim()) {
        reason = body.reason.trim();
      }
    } catch {
      // Body is optional
    }

    // 3. Fetch order and verify ownership & cancellation eligibility
    const orderRes = await client.query(
      `SELECT id, customer_id, order_status, delivery_status, order_no
       FROM "${schema}".online_orders
       WHERE id = $1
       LIMIT 1`,
      [orderId]
    );

    if (!orderRes.rowCount) {
      return NextResponse.json(
        { success: false, error: "Order not found." },
        { status: 404 }
      );
    }

    const order = orderRes.rows[0];

    // Ensure customer owns the order
    if (Number(order.customer_id) !== Number(customerSession.customerId)) {
      return NextResponse.json(
        { success: false, error: "You are not authorized to cancel this order." },
        { status: 403 }
      );
    }

    // Check cancellation window:
    // Allowed only if order_status IN ('placed', 'confirmed') AND delivery_status NOT IN ('packed', 'shipped', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered')
    const disallowedDeliveryStatuses = [
      "packed",
      "picked_up",
      "in_transit",
      "out_for_delivery",
      "delivered",
    ];

    if (
      !["placed", "confirmed"].includes(order.order_status) ||
      disallowedDeliveryStatuses.includes(order.delivery_status)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: `Order cannot be cancelled in its current state (Order: ${order.order_status}, Delivery: ${order.delivery_status}). Orders can only be cancelled before they are packed or shipped.`,
        },
        { status: 400 }
      );
    }

    // 4. Transition order status using state machine inside transaction
    await client.query("BEGIN");

    await transitionOrderStatus(client, schema, orderId, "cancelled", {
      changedBy: `customer:${customerSession.customerId}`,
      note: `Customer cancellation: ${reason}`,
    });

    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      message: `Order #${order.order_no} has been successfully cancelled.`,
    });
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("Customer order cancellation error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Failed to cancel order.",
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
