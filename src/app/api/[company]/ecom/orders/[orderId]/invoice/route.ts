import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTenantSchemaByCompany } from "@/lib/tenant";
import { getStorefrontCustomerSession } from "@/lib/storefrontAuth";
import { requireStaff } from "@/lib/apiGuard";
import { generateTaxInvoiceForOrder, renderInvoiceHtml } from "@/lib/tax/invoiceService";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ company: string; orderId: string }> }
) {
  const client = await pool.connect();

  try {
    const { company, orderId: rawIdentifier } = await params;
    const identifier = String(rawIdentifier || "").trim();

    if (!identifier) {
      return NextResponse.json(
        { success: false, error: "Order identifier is required." },
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

    // Ensure invoice_token exists
    await client.query(`
      ALTER TABLE "${schema}".online_orders ADD COLUMN IF NOT EXISTS invoice_token UUID DEFAULT gen_random_uuid();
      UPDATE "${schema}".online_orders SET invoice_token = gen_random_uuid() WHERE invoice_token IS NULL;
    `);

    // Check if identifier is a UUID (direct invoice_token link)
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);

    // Auth check: Customer or Staff
    const customerSession = await getStorefrontCustomerSession(req, company);
    const staffGuard = await requireStaff(req, company, { permission: "ecommerce_access", requireEcom: false });
    const isStaff = staffGuard.ok;

    // If not accessing via a secure UUID invoice token, require customer or staff authentication
    if (!isUuid && !customerSession && !isStaff) {
      return NextResponse.json(
        { success: false, error: "Authentication required to view tax invoice." },
        { status: 401 }
      );
    }

    const isNumeric = /^\d+$/.test(identifier);

    // Fetch order by invoice_token, order_no, or numeric id
    const orderRes = await client.query(
      `SELECT id, customer_id, company_id, order_no, invoice_token, order_status, payment_status
       FROM "${schema}".online_orders
       WHERE invoice_token::text = $1
          OR order_no = $1
          OR (id::text = $1 AND $2::boolean = TRUE)
       LIMIT 1`,
      [identifier, isNumeric]
    );

    if (orderRes.rowCount === 0) {
      return NextResponse.json(
        { success: false, error: "Invoice not found or access denied." },
        { status: 404 }
      );
    }

    const order = orderRes.rows[0];
    const orderId = Number(order.id);

    // Ownership verification:
    // If accessing via UUID, verify invoice_token matches order.
    // Otherwise, ensure logged-in customer owns this order (or user is staff).
    const isTokenMatch = isUuid && order.invoice_token && String(order.invoice_token).toLowerCase() === identifier.toLowerCase();
    if (!isStaff && !isTokenMatch) {
      if (!customerSession || Number(order.customer_id) !== Number(customerSession.customerId)) {
        return NextResponse.json(
          { success: false, error: "Access denied. You do not own this order." },
          { status: 403 }
        );
      }
    }

    // Fetch or Generate Tax Invoice
    let invoice = await generateTaxInvoiceForOrder(client, schema, orderId);

    // Fetch company info for header
    const compRes = await client.query(
      `SELECT company_name, gst_number, address, city, state, country
       FROM public.companies
       WHERE id = $1`,
      [order.company_id]
    );
    const companyData = compRes.rows[0] || {};

    const url = new URL(req.url);
    const format = url.searchParams.get("format");

    if (format === "json") {
      return NextResponse.json({
        success: true,
        invoice,
        company: companyData,
      });
    }

    // Return rendered HTML invoice
    const html = renderInvoiceHtml(invoice, companyData, { companySlug: company, orderId });
    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  } catch (err: any) {
    console.error("[Get Invoice Route Error]:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to generate invoice." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

