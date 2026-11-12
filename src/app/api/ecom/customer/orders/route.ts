import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { resolveCompanySlug } from "@/lib/customerAuth";
import { verifySession, CUSTOMER_COOKIE_NAME, CustomerSessionPayload } from "@/lib/session";

async function getSessionCustomer(req: NextRequest): Promise<CustomerSessionPayload | null> {
  const cookieVal = req.cookies.get(CUSTOMER_COOKIE_NAME)?.value;
  if (!cookieVal) return null;
  const session = await verifySession<CustomerSessionPayload>(cookieVal, "customer");
  if (!session || !session.customerId || !session.company) return null;
  return session;
}

export async function GET(req: NextRequest) {
  const session = await getSessionCustomer(req);
  const companySlug = await resolveCompanySlug(req);

  if (session && companySlug && session.company.trim().toLowerCase() !== companySlug.trim().toLowerCase()) {
    return NextResponse.json({ success: false, message: "Forbidden: Company mismatch" }, { status: 403 });
  }

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

    const ordersWithDetails: any[] = [];

    // 1. Fetch Online Storefront Orders from online_orders
    const onlineOrdersRes = await client.query(
      `SELECT 
         o.id,
         o.order_no,
         o.order_no AS sales_no,
         o.created_at,
         o.created_at AS sales_date,
         o.currency,
         o.order_status,
         o.payment_status,
         o.delivery_status,
         o.delivery_partner,
         o.payment_method,
         o.subtotal,
         o.tax_amount,
         o.shipping_fee,
         o.discount_amount,
         o.total_amount,
         'online' AS channel_type,
         'Online Storefront Order' AS channel_label
       FROM "${schema}".online_orders o
       WHERE o.customer_id = $1
          OR (o.customer_id IN (SELECT c.id FROM "${schema}".customers c WHERE c.phone = $2 AND $2 <> ''))
       ORDER BY o.id DESC`,
      [customerId, custPhone]
    );

    for (const order of onlineOrdersRes.rows) {
      // Items per order
      const itemsRes = await client.query(
        `SELECT 
           oi.id,
           oi.variant_id,
           oi.product_name,
           oi.rate,
           oi.qty,
           oi.discount,
           oi.tax_amount,
           oi.line_total,
           oi.fulfillment_status,
           (SELECT img.image_url FROM "${schema}".product_images img WHERE img.variant_id = oi.variant_id ORDER BY img.is_primary DESC LIMIT 1) AS image_url
         FROM "${schema}".online_order_items oi
         WHERE oi.order_id = $1`,
        [order.id]
      );

      // Audit status history timeline
      const historyRes = await client.query(
        `SELECT id, status_type, from_status, to_status, changed_by, note, created_at
         FROM "${schema}".online_order_status_history
         WHERE order_id = $1
         ORDER BY created_at ASC`,
        [order.id]
      );

      // Customer visible order notes
      let notesRows: any[] = [];
      try {
        const notesRes = await client.query(
          `SELECT id, author_name, author_type, content, created_at
           FROM "${schema}".order_notes
           WHERE order_id = $1 AND is_customer_visible = TRUE
           ORDER BY created_at ASC`,
          [order.id]
        );
        notesRows = notesRes.rows;
      } catch {
        // order_notes table might not have been created yet on older schema
      }

      // Delivery tracking info if available
      let deliveryRow: any = null;
      try {
        const delRes = await client.query(
          `SELECT id, delivery_partner, tracking_number, awb_code, estimated_delivery_date, status, updated_at
           FROM "${schema}".online_order_deliveries
           WHERE order_id = $1
           ORDER BY id DESC LIMIT 1`,
          [order.id]
        );
        deliveryRow = delRes.rows[0] || null;
      } catch {
        // deliveries table fallback
      }

      ordersWithDetails.push({
        ...order,
        subtotal: Number(order.subtotal || 0),
        tax_amount: Number(order.tax_amount || 0),
        shipping_fee: Number(order.shipping_fee || 0),
        discount_amount: Number(order.discount_amount || 0),
        total_amount: Number(order.total_amount || 0),
        history: historyRes.rows,
        customerNotes: notesRows,
        delivery: deliveryRow,
        items: itemsRes.rows.map((row) => ({
          id: row.id,
          variantId: row.variant_id,
          productName: row.product_name || "Product",
          rate: Number(row.rate || 0),
          qty: Number(row.qty || 1),
          discount: Number(row.discount || 0),
          lineTotal: Number(row.line_total || 0),
          fulfillmentStatus: row.fulfillment_status,
          imageUrl: row.image_url || "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80",
        })),
      });
    }

    // 2. Also fetch linked POS In-Store Purchases from sales_header
    try {
      const posRes = await client.query(
        `SELECT 
           sh.id,
           sh.sales_no,
           sh.sales_no AS order_no,
           sh.sales_date,
           sh.sales_date AS created_at,
           sh.currency,
           sh.status AS order_status,
           sh.payment_status,
           'delivered' AS delivery_status,
           'pos' AS payment_method,
           sh.subtotal,
           sh.tax_amount,
           0 AS shipping_fee,
           0 AS discount_amount,
           sh.total_amount,
           'pos' AS channel_type,
           'In-Store POS Purchase' AS channel_label
         FROM "${schema}".sales_header sh
         WHERE (sh.customer_id = $1
            OR (sh.customer_id IN (SELECT c.id FROM "${schema}".customers c WHERE c.phone = $2 AND $2 <> '')))
           AND (sh.sales_no NOT LIKE 'ORD-%')
         ORDER BY sh.id DESC`,
        [customerId, custPhone]
      );

      for (const order of posRes.rows) {
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
          subtotal: Number(order.subtotal || 0),
          tax_amount: Number(order.tax_amount || 0),
          shipping_fee: 0,
          discount_amount: 0,
          total_amount: Number(order.total_amount || 0),
          history: [],
          customerNotes: [],
          delivery: null,
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
    } catch {
      // Sales header query fallback
    }

    // Sort all orders by date descending
    ordersWithDetails.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return NextResponse.json({ success: true, orders: ordersWithDetails });
  } catch (err: any) {
    console.error("Get Customer Orders Error:", err);
    return NextResponse.json({ success: false, message: err.message || "Failed to fetch orders" }, { status: 500 });
  } finally {
    client.release();
  }
}
