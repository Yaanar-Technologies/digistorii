import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getStorefrontCustomerSession } from "@/lib/storefrontAuth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ company: string; orderId: string }> }
) {
  const { company, orderId: rawOrderId } = await params;
  const rawId = String(rawOrderId || "").trim();

  if (!rawId) {
    return NextResponse.json(
      { success: false, error: "Invalid order ID provided." },
      { status: 400 }
    );
  }

  // Authenticate customer session
  const session = await getStorefrontCustomerSession(req, company);
  if (!session?.customerId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized: sign in required." },
      { status: 401 }
    );
  }

  const isNumeric = /^\d+$/.test(rawId);
  const numericId = isNumeric ? Number(rawId) : 0;

  const client = await pool.connect();
  try {
    const schema = session.schema;

    // 1. Fetch order and verify customer ownership (support numeric id, order_no, or invoice_token)
    const orderRes = await client.query(
      `SELECT
         o.*,
         COALESCE(c.cust_name, c.name, 'Customer') AS customer_name,
         c.phone AS customer_phone,
         c.email AS customer_email,
         c.cust_code AS customer_code,
         sa.recipient_name AS shipping_name,
         sa.recipient_phone AS shipping_phone,
         sa.address_line1 AS shipping_address_line1,
         sa.address_line2 AS shipping_address_line2,
         sa.city AS shipping_city,
         sa.state AS shipping_state,
         sa.pincode AS shipping_pincode,
         sa.country AS shipping_country,
         ba.recipient_name AS billing_name,
         ba.recipient_phone AS billing_phone,
         ba.address_line1 AS billing_address_line1,
         ba.address_line2 AS billing_address_line2,
         ba.city AS billing_city,
         ba.state AS billing_state,
         ba.pincode AS billing_pincode,
         ba.country AS billing_country
       FROM "${schema}".online_orders o
       LEFT JOIN "${schema}".customers c ON c.id = o.customer_id
       LEFT JOIN "${schema}".customer_addresses sa ON sa.id = o.shipping_address_id
       LEFT JOIN "${schema}".customer_addresses ba ON ba.id = o.billing_address_id
       WHERE (o.id = $1 OR o.order_no = $2 OR o.invoice_token::text = $2)
         AND o.customer_id = $3
       LIMIT 1`,
      [numericId, rawId, session.customerId]
    );

    if (orderRes.rowCount === 0) {
      return NextResponse.json(
        { success: false, error: `Order #${rawId} not found or unauthorized.` },
        { status: 404 }
      );
    }

    const orderRow = orderRes.rows[0];
    const orderId = Number(orderRow.id);

    // 2. Fetch order items
    const itemsRes = await client.query(
      `SELECT
         oi.id,
         oi.variant_id,
         oi.product_name,
         oi.uom,
         oi.hsn_no,
         oi.rate,
         oi.qty,
         oi.discount,
         oi.tax_master_id,
         oi.tax_amount,
         oi.line_total,
         oi.fulfillment_status,
         oi.created_at,
         pv.sku,
         pcl.color_name AS color,
         pcl.hex_code AS color_hex,
         pv.size
       FROM "${schema}".online_order_items oi
       LEFT JOIN "${schema}".product_variants pv ON pv.id = oi.variant_id
       LEFT JOIN "${schema}".product_colors pcl ON pcl.id = pv.color_id
       WHERE oi.order_id = $1
       ORDER BY oi.id ASC`,
      [orderId]
    );

    // 3. Fetch payment audit records (strictly omit sensitive secrets)
    const paymentsRes = await client.query(
      `SELECT
         id,
         gateway,
         gateway_order_id,
         gateway_payment_id,
         amount,
         status,
         method,
         created_at
       FROM "${schema}".online_order_payments
       WHERE order_id = $1
       ORDER BY created_at ASC`,
      [orderId]
    );

    // 4. Fetch delivery tracking information
    const deliveryRes = await client.query(
      `SELECT
         id,
         courier_partner,
         awb_number,
         tracking_url,
         pickup_scheduled_at,
         picked_up_at,
         out_for_delivery_at,
         delivered_at,
         estimated_delivery_at,
         last_location,
         created_at,
         updated_at
       FROM "${schema}".online_order_deliveries
       WHERE order_id = $1
       LIMIT 1`,
      [orderId]
    );

    // 5. Fetch status history timeline
    const historyRes = await client.query(
      `SELECT
         id,
         status_type,
         from_status,
         to_status,
         note,
         created_at
       FROM "${schema}".online_order_status_history
       WHERE order_id = $1
       ORDER BY created_at ASC`,
      [orderId]
    );

    return NextResponse.json({
      success: true,
      order: orderRow,
      items: itemsRes.rows,
      delivery: deliveryRes.rows[0] || null,
      payments: paymentsRes.rows,
      statusHistory: historyRes.rows,
    });
  } catch (err: any) {
    console.error("[Customer Order Detail API] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to load order detail." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
