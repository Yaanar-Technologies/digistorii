import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET(req: NextRequest) {
  const sessionCookie = req.cookies.get("customer_session")?.value;
  if (!sessionCookie) {
    return NextResponse.json({ success: false, authenticated: false }, { status: 200 });
  }

  try {
    const session = JSON.parse(sessionCookie);
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
