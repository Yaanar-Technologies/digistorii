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
    const ordersRes = await client.query(
      `SELECT 
         o.id,
         o.order_no,
         o.created_at,
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
         d.courier_partner,
         d.awb_number,
         d.tracking_url,
         json_agg(
           json_build_object(
             'id', oi.id,
             'variant_id', oi.variant_id,
             'product_name', oi.product_name,
             'uom', oi.uom,
             'rate', oi.rate,
             'qty', oi.qty,
             'line_total', oi.line_total,
             'fulfillment_status', oi.fulfillment_status
           )
         ) AS items
       FROM "${session.schema}".online_orders o
       LEFT JOIN "${session.schema}".online_order_deliveries d ON d.order_id = o.id
       LEFT JOIN "${session.schema}".online_order_items oi ON oi.order_id = o.id
       WHERE o.customer_id = $1
       GROUP BY o.id, d.courier_partner, d.awb_number, d.tracking_url
       ORDER BY o.created_at DESC`,
      [session.customerId]
    );

    return NextResponse.json({
      success: true,
      orders: ordersRes.rows,
    });
  } catch (err: any) {
    console.error("Customer orders API error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  } finally {
    client.release();
  }
}

