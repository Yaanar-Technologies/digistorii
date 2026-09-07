import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTenantSchema, getTenantSchemaByCompany } from "@/lib/tenant";

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
        { success: false, error: "Invalid order ID provided." },
        { status: 400 }
      );
    }

    let schema = "";
    try {
      const tenantInfo = await getTenantSchema(req);
      schema = tenantInfo.schema;
    } catch {
      const tenantInfo = await getTenantSchemaByCompany(company);
      schema = tenantInfo.schema;
    }

    // 1. Fetch order header with customer and addresses
    const orderRes = await client.query(
      `SELECT
         o.*,
         COALESCE(c.name, 'Guest Customer') AS customer_name,
         c.phone AS customer_phone,
         c.email AS customer_email,
         c.cust_code AS customer_code,
         sa.name AS shipping_name,
         sa.address_line1 AS shipping_address_line1,
         sa.address_line2 AS shipping_address_line2,
         sa.city AS shipping_city,
         sa.state AS shipping_state,
         sa.pincode AS shipping_pincode,
         sa.country AS shipping_country,
         sa.phone AS shipping_phone,
         ba.name AS billing_name,
         ba.address_line1 AS billing_address_line1,
         ba.address_line2 AS billing_address_line2,
         ba.city AS billing_city,
         ba.state AS billing_state,
         ba.pincode AS billing_pincode,
         ba.country AS billing_country,
         ba.phone AS billing_phone
       FROM "${schema}".online_orders o
       LEFT JOIN "${schema}".customers c ON c.id = o.customer_id
       LEFT JOIN "${schema}".customer_addresses sa ON sa.id = o.shipping_address_id
       LEFT JOIN "${schema}".customer_addresses ba ON ba.id = o.billing_address_id
       WHERE o.id = $1
       LIMIT 1`,
      [orderId]
    );

    if (orderRes.rowCount === 0) {
      return NextResponse.json(
        { success: false, error: `Order #${orderId} not found.` },
        { status: 404 }
      );
    }

    const orderRow = orderRes.rows[0];

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
         oi.reservation_id,
         oi.fulfillment_status,
         oi.created_at,
         pv.sku,
         pv.color,
         pv.size
       FROM "${schema}".online_order_items oi
       LEFT JOIN "${schema}".product_variants pv ON pv.id = oi.variant_id
       WHERE oi.order_id = $1
       ORDER BY oi.id ASC`,
      [orderId]
    );

    // 3. Fetch payment audit records (strictly omit gateway_signature and sensitive secrets)
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
         changed_by,
         note,
         created_at
       FROM "${schema}".online_order_status_history
       WHERE order_id = $1
       ORDER BY created_at ASC`,
      [orderId]
    );

    // 6. Fetch store courier settings (safe fields only)
    const settingsRes = await client.query(
      `SELECT delivery_partner, pickup_location_code
       FROM "${schema}".ecom_settings
       LIMIT 1`
    );
    const storeSettings = settingsRes.rows[0] || { delivery_partner: null };

    return NextResponse.json({
      success: true,
      order: {
        ...orderRow,
        subtotal: Number(orderRow.subtotal),
        tax_amount: Number(orderRow.tax_amount),
        shipping_fee: Number(orderRow.shipping_fee),
        discount_amount: Number(orderRow.discount_amount),
        total_amount: Number(orderRow.total_amount),
      },
      items: itemsRes.rows.map((item) => ({
        ...item,
        rate: Number(item.rate),
        qty: Number(item.qty),
        discount: Number(item.discount || 0),
        tax_amount: Number(item.tax_amount || 0),
        line_total: Number(item.line_total),
      })),
      payments: paymentsRes.rows.map((p) => ({
        ...p,
        amount: Number(p.amount),
      })),
      delivery: deliveryRes.rows[0] || null,
      history: historyRes.rows,
      ecom_settings: {
        delivery_partner: storeSettings.delivery_partner || "self",
        pickup_location_code: storeSettings.pickup_location_code || null,
      },
    });
  } catch (err: any) {
    console.error("[Order Detail API Error]:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch order detail." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
