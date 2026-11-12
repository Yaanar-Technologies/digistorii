import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getStorefrontCustomerSession } from "@/lib/storefrontAuth";
import { ensureCustomerSchema } from "@/lib/customerAuth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  const { company } = await params;
  const session = await getStorefrontCustomerSession(req, company);

  if (!session) {
    return NextResponse.json({ authenticated: false, customer: null });
  }

  const client = await pool.connect();
  try {
    await ensureCustomerSchema(client, session.schema);

    const custRes = await client.query(
      `SELECT id, cust_code, cust_name, name, email, phone, channel, is_verified,
              notification_preferences, created_at
       FROM "${session.schema}".customers
       WHERE id = $1 AND is_deleted IS NOT TRUE
       LIMIT 1`,
      [session.customerId]
    );

    if (!custRes.rowCount) {
      return NextResponse.json({ authenticated: false, customer: null });
    }

    const customer = custRes.rows[0];

    // Fetch default addresses
    const addrRes = await client.query(
      `SELECT id, recipient_name, recipient_phone, address_line1, address_line2,
              city, state, pincode, country, is_default, address_type
       FROM "${session.schema}".customer_addresses
       WHERE customer_id = $1
       ORDER BY is_default DESC, id DESC`,
      [session.customerId]
    );

    return NextResponse.json({
      authenticated: true,
      customer: {
        id: customer.id,
        cust_code: customer.cust_code,
        name: customer.name || customer.cust_name || "Customer",
        email: customer.email || "",
        phone: customer.phone || "",
        channel: customer.channel,
        is_verified: customer.is_verified,
        notification_preferences: customer.notification_preferences || { whatsapp: true, sms: true, email: true },
        created_at: customer.created_at,
        addresses: addrRes.rows,
      },
    });
  } catch (err: any) {
    console.error("Storefront Me Error:", err);
    return NextResponse.json({ authenticated: false, customer: null });
  } finally {
    client.release();
  }
}

