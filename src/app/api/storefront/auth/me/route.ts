import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
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
    const companySlug = session.company;
    const customerId = session.customerId;

    if (!companySlug || !customerId) {
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

      const custRes = await client.query(
        `SELECT id, name, email, phone FROM "${schema}".customers WHERE id = $1 LIMIT 1`,
        [customerId]
      );

      if (!custRes.rowCount) {
        return NextResponse.json({ success: false, authenticated: false }, { status: 200 });
      }

      const addressesRes = await client.query(
        `SELECT id, address_line1, address_line2, city, state, pincode, country, is_default
         FROM "${schema}".customer_addresses
         WHERE customer_id = $1
         ORDER BY is_default DESC, id DESC`,
        [customerId]
      );

      return NextResponse.json({
        success: true,
        authenticated: true,
        customer: {
          ...custRes.rows[0],
          addresses: addressesRes.rows,
        },
      });
    } finally {
      client.release();
    }
  } catch (err) {
    return NextResponse.json({ success: false, authenticated: false }, { status: 200 });
  }
}
