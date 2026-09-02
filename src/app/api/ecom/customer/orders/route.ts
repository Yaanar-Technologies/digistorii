import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { resolveCompanySlug } from "@/lib/customerAuth";

function getSessionCustomer(req: NextRequest) {
  const cookieVal = req.cookies.get("customer_session")?.value;
  if (!cookieVal) return null;
  try {
    const session = JSON.parse(cookieVal);
    if (!session.customerId || !session.company) return null;
    return session;
  } catch (err) {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const session = getSessionCustomer(req);
  const companySlug = await resolveCompanySlug(req);

  if (!session && !companySlug) {
    return NextResponse.json({ success: false, message: "Unauthorized customer session" }, { status: 401 });
  }

  const customerId = session?.customerId;
  if (!customerId) {
    return NextResponse.json({ success: false, message: "Unauthorized customer session" }, { status: 401 });
  }

  const client = await pool.connect();
  try {
    const companyRes = await client.query(
      `SELECT id, schema_name FROM public.companies WHERE LOWER(subdomain_url) = $1 LIMIT 1`,
      [companySlug || session?.company]
    );

    if (!companyRes.rowCount) {
      return NextResponse.json({ success: false, message: "Company not found" }, { status: 404 });
    }

    const { schema_name: schema } = companyRes.rows[0];

    // Fetch customer's phone to also match POS bills created under phone
    const custRes = await client.query(
      `SELECT id, phone, email FROM "${schema}".customers WHERE id = $1 LIMIT 1`,
      [customerId]
    );

    const custPhone = custRes.rows[0]?.phone || "";
    const custEmail = custRes.rows[0]?.email || "";

    const ordersRes = await client.query(
      `SELECT 
         sh.id,
         sh.sales_no,
         sh.sales_date,
         sh.currency,
         sh.status,
         sh.payment_status,
         sh.subtotal,
         sh.tax_amount,
         sh.total_amount,
         sh.created_by,
         sh.created_at,
         CASE 
           WHEN sh.created_by = 'Storefront Customer' OR sh.sales_no LIKE 'ORD-%' THEN 'online'
           ELSE 'pos'
         END AS channel_type,
         CASE 
           WHEN sh.created_by = 'Storefront Customer' OR sh.sales_no LIKE 'ORD-%' THEN 'Online Storefront Order'
           ELSE 'In-Store POS Purchase'
         END AS channel_label
       FROM "${schema}".sales_header sh
       WHERE sh.customer_id = $1
          OR (sh.customer_id IN (SELECT c.id FROM "${schema}".customers c WHERE c.phone = $2 AND $2 <> ''))
       ORDER BY sh.id DESC`,
      [customerId, custPhone]
    );

    const ordersWithDetails = [];

    for (const order of ordersRes.rows) {
      const detailsRes = await client.query(
        `SELECT 
           sd.id,
           sd.product_id,
           sd.rate,
           sd.qty,
           sd.discount,
           sd.line_total,
           p.name AS product_name,
           (SELECT img.image_url FROM "${schema}".product_images img WHERE img.variant_id = pv.id ORDER BY img.is_primary DESC LIMIT 1) AS image_url
         FROM "${schema}".sales_detail sd
         LEFT JOIN "${schema}".product_variants pv ON pv.id = sd.product_id
         LEFT JOIN "${schema}".products p ON p.id = pv.product_id
         WHERE sd.sales_id = $1`,
        [order.id]
      );

      ordersWithDetails.push({
        ...order,
        items: detailsRes.rows.map((row) => ({
          id: row.id,
          variantId: row.product_id,
          productName: row.product_name || "Product",
          rate: Number(row.rate || 0),
          qty: Number(row.qty || 1),
          lineTotal: Number(row.line_total || 0),
          imageUrl: row.image_url || "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80",
        })),
      });
    }

    return NextResponse.json({ success: true, orders: ordersWithDetails });
  } catch (err: any) {
    console.error("Get Customer Orders Error:", err);
    return NextResponse.json({ success: false, message: err.message || "Failed to fetch orders" }, { status: 500 });
  } finally {
    client.release();
  }
}
