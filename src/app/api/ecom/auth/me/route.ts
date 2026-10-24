import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { resolveCompanySlug, ensureCustomerSchema } from "@/lib/customerAuth";
import { verifySession, CUSTOMER_COOKIE_NAME, CustomerSessionPayload } from "@/lib/session";

export async function GET(req: NextRequest) {
  const sessionCookie = req.cookies.get(CUSTOMER_COOKIE_NAME)?.value;
  if (!sessionCookie) {
    return NextResponse.json({ success: false, authenticated: false }, { status: 200 });
  }

  try {
    const session = await verifySession<CustomerSessionPayload>(sessionCookie, "customer");
    if (!session) {
      return NextResponse.json({ success: false, authenticated: false }, { status: 200 });
    }
    const customerId = Number(session.customerId || 0);

    if (!customerId || customerId <= 0) {
      return NextResponse.json({ success: false, authenticated: false }, { status: 200 });
    }

    const companySlug = (await resolveCompanySlug(req, session)) || session.company;
    if (!companySlug) {
      return NextResponse.json({ success: false, authenticated: false }, { status: 200 });
    }

    const client = await pool.connect();
    try {
      const companyRes = await client.query(
        `SELECT schema_name FROM public.companies WHERE LOWER(subdomain_url) = $1 LIMIT 1`,
        [companySlug]
      );

      if (!companyRes.rowCount) {
        return NextResponse.json({ success: false, authenticated: false }, { status: 200 });
      }

      const { schema_name: schema } = companyRes.rows[0];
      await ensureCustomerSchema(client, schema);

      const custRes = await client.query(
        `SELECT id, cust_code, cust_name, name, email, phone, channel
         FROM "${schema}".customers 
         WHERE id = $1 
         LIMIT 1`,
        [customerId]
      );

      if (!custRes.rowCount) {
        return NextResponse.json({ success: false, authenticated: false }, { status: 200 });
      }

      const addressesRes = await client.query(
        `SELECT id, recipient_name, recipient_phone, address_line1, address_line2, city, state, pincode, country, is_default
         FROM "${schema}".customer_addresses
         WHERE customer_id = $1
         ORDER BY is_default DESC, id DESC`,
        [customerId]
      );

      const customerRecord = custRes.rows[0];
      const customerData = {
        id: customerRecord.id,
        cust_code: customerRecord.cust_code,
        cust_name: customerRecord.cust_name || customerRecord.name,
        name: customerRecord.name || customerRecord.cust_name || "Customer",
        email: customerRecord.email || "",
        phone: customerRecord.phone || "",
        channel: customerRecord.channel || "ecom",
        addresses: addressesRes.rows,
      };

      return NextResponse.json({
        success: true,
        authenticated: true,
        customer: customerData,
      });
    } finally {
      client.release();
    }
  } catch (err) {
    return NextResponse.json({ success: false, authenticated: false }, { status: 200 });
  }
}
