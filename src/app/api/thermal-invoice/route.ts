import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { getTenantSchema } from "@/lib/tenant";
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const salesNo = searchParams.get("sales_no");

    // Retrieve the tenant/schema ID from headers passed by the component
    const tenantHeader = request.headers.get("x-tenant") || "";
    const companyLookup = await pool.query(
      "SELECT id FROM public.companies WHERE subdomain_url = $1 OR id::text = $1",
      [tenantHeader]
    );
    const tenantId = companyLookup.rows[0].id; // This will now be '68'
    const { schema } = await getTenantSchema(request);

    if (!salesNo || !tenantId) {
      return NextResponse.json({ error: "Missing sales_no or tenant details" }, { status: 400 });
    }

    // Fetch company data along with the specific location tied to this sale
    const companyQuery = `
      SELECT 
        c.company_name,
        c.gst_number,
        l.mobile,
        l.registered_address_line_1,
        l.registered_address_line_2,
        l.registered_city,
        l.registered_state,
        l.registered_pincode,
        l.registered_country
      FROM public.companies c
      JOIN ${schema}.sales_header sh ON sh.sales_no = $2
      LEFT JOIN ${schema}.locations l ON l.id = sh.location_id
      WHERE c.id = $1
      LIMIT 1;
    `;

    const companyResult = await pool.query(companyQuery, [tenantId, salesNo]);
    const companyData = companyResult.rows[0] || {};

    // 3. Get Salesman Name from created_by mapping to public.users
    const salesmanQuery = `
      SELECT u.name 
      FROM ${schema}.sales_header sh
    JOIN public.users u ON u.id = sh.created_by::integer 
      WHERE sh.sales_no = $1 LIMIT 1;

    `;
    const salesmanResult = await pool.query(salesmanQuery, [salesNo]);
    const salesmanName = salesmanResult.rows[0]?.name || null;

    // 4. Get breakdown of payment modes and amounts
    const paymentsQuery = `
      SELECT 
        pm.name as payment_mode_name,
        sp.amount,
        sp.paid_amount,
        sp.actual_amount,
        sp.return_change
      FROM ${schema}.sales_payments sp
      LEFT JOIN ${schema}.payment_modes pm ON pm.id = sp.payment_mode_id
      LEFT JOIN ${schema}.sales_header sh ON sh.id = sp.sales_id
      WHERE sh.sales_no = $1;
    `;
    const paymentsResult = await pool.query(paymentsQuery, [salesNo]);
    const paymentModes = paymentsResult.rows.map(row => ({
      name: row.payment_mode_name || "Unknown Mode",
      amount: parseFloat(row.amount || 0),
      paid_amount: parseFloat(row.paid_amount || 0),
      actual_amount: parseFloat(row.actual_amount || 0),
      return_change: parseFloat(row.return_change || 0)
    }));
    return NextResponse.json({
      company: {
        company_name: companyData.company_name,
        gst_number: companyData.gst_number,
      },
      location: {
        mobile: companyData.mobile,
        registered_address_line_1: companyData.registered_address_line_1,
        registered_address_line_2: companyData.registered_address_line_2,
        registered_city: companyData.registered_city,
        registered_state: companyData.registered_state,
        registered_pincode: companyData.registered_pincode,
        registered_country: companyData.registered_country,
      },
      salesmanName: salesmanName,
      paymentModes: paymentModes,
    });


  } catch (error: any) {
    console.error("Thermal invoice API Error:", error);
    // Inside your route.ts catch block:
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}