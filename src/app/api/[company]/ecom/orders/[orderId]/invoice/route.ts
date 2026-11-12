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

    // Auth check: Customer or Staff
    const customerSession = await getStorefrontCustomerSession(req, company);
    const staffGuard = await requireStaff(req, company, { permission: "ecommerce_access", requireEcom: false });
    const isStaff = staffGuard.ok;

    if (!customerSession && !isStaff) {
      return NextResponse.json(
        { success: false, error: "Authentication required to view tax invoice." },
        { status: 401 }
      );
    }

    // Verify order ownership if customer
    const orderRes = await client.query(
      `SELECT id, customer_id, company_id, order_status, payment_status
       FROM "${schema}".online_orders
       WHERE id = $1`,
      [orderId]
    );

    if (orderRes.rowCount === 0) {
      return NextResponse.json(
        { success: false, error: `Order #${orderId} not found.` },
        { status: 404 }
      );
    }

    const order = orderRes.rows[0];

    if (!isStaff && customerSession) {
      if (Number(order.customer_id) !== Number(customerSession.customerId)) {
        return NextResponse.json(
          { success: false, error: "Access denied." },
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

