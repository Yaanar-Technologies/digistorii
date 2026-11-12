import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTenantSchemaByCompany } from "@/lib/tenant";
import { getStorefrontCustomerSession } from "@/lib/storefrontAuth";
import { requireStaff, staffDisplayName } from "@/lib/apiGuard";

interface ReturnItemPayload {
  variantId?: number | string;
  name?: string;
  qty: number;
  price?: number;
}

interface ReturnRequestBody {
  returnReason: string;
  customerNotes?: string;
  items?: ReturnItemPayload[];
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
      const tenantInfo = await getTenantSchemaByCompany(company);
      schema = tenantInfo.schema;
    } catch {
      return NextResponse.json(
        { success: false, error: `Company '${company}' not found.` },
        { status: 404 }
      );
    }

    // Authenticate: Must be authenticated customer who owns the order OR staff
    const customerSession = await getStorefrontCustomerSession(req, company);
    const staffGuard = await requireStaff(req, company, { permission: "ecommerce_access", requireEcom: false });
    const staffSession = staffGuard.ok ? staffGuard.staff : null;

    if (!customerSession && !staffSession) {
      return NextResponse.json(
        { success: false, error: "Authentication required to request a return." },
        { status: 401 }
      );
    }

    let body: ReturnRequestBody;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body provided." },
        { status: 400 }
      );
    }

    const { returnReason, customerNotes, items: requestedItems } = body;
    if (!returnReason || typeof returnReason !== "string" || !returnReason.trim()) {
      return NextResponse.json(
        { success: false, error: "A valid return reason is required." },
        { status: 400 }
      );
    }

    await client.query("BEGIN");
    inTransaction = true;

    // Fetch the order
    const orderRes = await client.query(
      `SELECT id, order_no, customer_id, order_status, delivery_status, payment_status,
              total_amount, subtotal, created_at
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

    // Ownership check for customer
    if (customerSession && !staffSession) {
      if (Number(order.customer_id) !== Number(customerSession.customerId)) {
        await client.query("ROLLBACK");
        inTransaction = false;
        return NextResponse.json(
          { success: false, error: "You are not authorized to return this order." },
          { status: 403 }
        );
      }
    }

    // Check existing active returns for this order
    const existingReturnRes = await client.query(
      `SELECT id, status FROM "${schema}".order_returns
       WHERE order_id = $1 AND status NOT IN ('rejected', 'cancelled')
       LIMIT 1`,
      [orderId]
    );

    if (existingReturnRes.rowCount && existingReturnRes.rowCount > 0) {
      await client.query("ROLLBACK");
      inTransaction = false;
      return NextResponse.json(
        {
          success: false,
          error: `An active return request (#${existingReturnRes.rows[0].id}) already exists for this order with status '${existingReturnRes.rows[0].status}'.`,
        },
        { status: 400 }
      );
    }

    // Fetch order line items
    const lineItemsRes = await client.query(
      `SELECT oi.id, oi.variant_id, oi.product_name, oi.qty, oi.rate, oi.discount, oi.tax_amount
       FROM "${schema}".online_order_items oi
       WHERE oi.order_id = $1`,
      [orderId]
    );

    const orderItems = lineItemsRes.rows;
    if (orderItems.length === 0) {
      await client.query("ROLLBACK");
      inTransaction = false;
      return NextResponse.json(
        { success: false, error: "No items found for this order." },
        { status: 400 }
      );
    }

    // Calculate items to return and refund amount
    let finalReturnItems: Array<{
      variant_id: number;
      name: string;
      qty: number;
      price: number;
    }> = [];
    let calculatedRefund = 0;

    if (requestedItems && Array.isArray(requestedItems) && requestedItems.length > 0) {
      for (const reqItem of requestedItems) {
        const matched = orderItems.find(
          (oi) => Number(oi.variant_id) === Number(reqItem.variantId) || oi.product_name === reqItem.name
        );
        if (matched) {
          const qty = Math.min(Number(reqItem.qty) || 1, Number(matched.qty));
          const unitRate = Number(matched.rate || 0);
          finalReturnItems.push({
            variant_id: Number(matched.variant_id || 0),
            name: matched.product_name,
            qty,
            price: unitRate,
          });
          calculatedRefund += qty * unitRate;
        }
      }
    }

    if (finalReturnItems.length === 0) {
      // Default to returning all items in the order
      finalReturnItems = orderItems.map((oi) => ({
        variant_id: Number(oi.variant_id || 0),
        name: oi.product_name,
        qty: Number(oi.qty),
        price: Number(oi.rate || 0),
      }));
      calculatedRefund = Number(order.total_amount);
    }

    const finalRefundAmount = Math.min(
      Number(order.total_amount),
      Math.max(0, Number(calculatedRefund.toFixed(2)))
    );

    const requesterName = staffSession
      ? `Staff: ${staffDisplayName(staffSession)}`
      : `Customer #${customerSession?.customerId || order.customer_id}`;

    // Insert return request
    const returnInsertRes = await client.query(
      `INSERT INTO "${schema}".order_returns (
         order_id, customer_id, status, return_reason, customer_notes,
         refund_amount, refund_status, items, created_at, updated_at
       )
       VALUES ($1, $2, 'requested', $3, $4, $5, 'pending', $6, NOW(), NOW())
       RETURNING *`,
      [
        orderId,
        order.customer_id || null,
        returnReason.trim(),
        customerNotes?.trim() || null,
        finalRefundAmount,
        JSON.stringify(finalReturnItems),
      ]
    );

    const createdReturn = returnInsertRes.rows[0];

    // Log in order notes
    await client.query(
      `INSERT INTO "${schema}".order_notes (company_id, order_id, author_name, author_type, content, is_customer_visible, created_at)
       SELECT company_id, id, $1, $2,
              'Return request submitted. Reason: ' || $3 || '. Refund amount estimated: ₹' || $4,
              true, NOW()
       FROM "${schema}".online_orders
       WHERE id = $5`,
      [
        requesterName,
        staffSession ? "staff" : "customer",
        returnReason.trim(),
        finalRefundAmount,
        orderId,
      ]
    );

    // Audit status history entry
    await client.query(
      `INSERT INTO "${schema}".online_order_status_history
         (order_id, status_type, from_status, to_status, changed_by, note, created_at)
       VALUES ($1, 'order', $2, 'return_requested', $3, $4, NOW())`,
      [
        orderId,
        order.order_status,
        requesterName,
        `Return requested for ${finalReturnItems.length} item(s): ${returnReason.trim()}`,
      ]
    );

    await client.query("COMMIT");
    inTransaction = false;

    return NextResponse.json({
      success: true,
      message: "Return request submitted successfully.",
      return_id: createdReturn.id,
      return_record: createdReturn,
    });
  } catch (err: any) {
    if (inTransaction) {
      await client.query("ROLLBACK");
    }
    console.error("[Create Return Route Error]:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to process return request." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ company: string; orderId: string }> }
) {
  const client = await pool.connect();
  try {
    const { company, orderId: rawOrderId } = await params;
    const orderId = Number(rawOrderId);

    if (!orderId || isNaN(orderId)) {
      return NextResponse.json(
        { success: false, error: "Invalid order ID." },
        { status: 400 }
      );
    }

    let schema = "";
    try {
      const tenantInfo = await getTenantSchemaByCompany(company);
      schema = tenantInfo.schema;
    } catch {
      return NextResponse.json(
        { success: false, error: `Company '${company}' not found.` },
        { status: 404 }
      );
    }

    const returnsRes = await client.query(
      `SELECT * FROM "${schema}".order_returns
       WHERE order_id = $1
       ORDER BY created_at DESC`,
      [orderId]
    );

    return NextResponse.json({
      success: true,
      returns: returnsRes.rows,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Internal server error" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
