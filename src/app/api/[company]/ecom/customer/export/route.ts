import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getStorefrontCustomerSession } from "@/lib/storefrontAuth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  const { company } = await params;
  const session = await getStorefrontCustomerSession(req, company);
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const client = await pool.connect();
  try {
    // 1. Profile
    const custRes = await client.query(
      `SELECT id, cust_code, cust_name, name, email, phone, channel, notification_preferences, created_at
       FROM "${session.schema}".customers WHERE id = $1`,
      [session.customerId]
    );

    // 2. Addresses
    const addrRes = await client.query(
      `SELECT id, recipient_name, recipient_phone, address_line1, address_line2, city, state, pincode, country, is_default, address_type
       FROM "${session.schema}".customer_addresses WHERE customer_id = $1`,
      [session.customerId]
    );

    // 3. Orders & items
    const ordersRes = await client.query(
      `SELECT o.id, o.order_no, o.order_status, o.payment_status, o.payment_method, o.total_amount, o.currency, o.created_at,
              json_agg(json_build_object('product', oi.product_name, 'qty', oi.qty, 'rate', oi.rate, 'total', oi.line_total)) AS items
       FROM "${session.schema}".online_orders o
       LEFT JOIN "${session.schema}".online_order_items oi ON oi.order_id = o.id
       WHERE o.customer_id = $1
       GROUP BY o.id
       ORDER BY o.created_at DESC`,
      [session.customerId]
    );

    const exportData = {
      exportDate: new Date().toISOString(),
      tenant: company,
      customer: custRes.rows[0] || null,
      savedAddresses: addrRes.rows,
      orderHistory: ordersRes.rows,
    };

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${company}-customer-data-${session.customerId}.json"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  } finally {
    client.release();
  }
}

