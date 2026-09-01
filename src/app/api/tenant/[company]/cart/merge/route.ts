import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getStorefrontCustomerSession } from "@/lib/storefrontAuth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  const { company } = await params;
  const session = await getStorefrontCustomerSession(req, company);

  if (!session) {
    return NextResponse.json({ success: false, message: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const guestItems = Array.isArray(body.guestItems) ? body.guestItems : [];

  const client = await pool.connect();
  try {
    for (const item of guestItems) {
      const variantId = Number(item.id || item.variantId || 0);
      const guestQty = Math.max(1, Number(item.quantity || 1));

      if (variantId > 0) {
        // Resolve quantity as GREATEST(existing, guestQty) or SUM
        await client.query(
          `INSERT INTO "${session.schema}".cart_items (customer_id, variant_id, quantity, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (customer_id, variant_id)
           DO UPDATE SET quantity = GREATEST("${session.schema}".cart_items.quantity, EXCLUDED.quantity), updated_at = NOW()`,
          [session.customerId, variantId, guestQty]
        );
      }
    }

    const query = `
      SELECT 
        pv.id AS variant_id,
        p.name AS product_name,
        ci.quantity AS cart_quantity,
        COALESCE(
          (SELECT image_url FROM "${session.schema}".product_images WHERE variant_id = pv.id ORDER BY is_primary DESC, id ASC LIMIT 1),
          (SELECT image_url FROM "${session.schema}".product_images WHERE product_id = p.id ORDER BY is_primary DESC, id ASC LIMIT 1),
          'https://placehold.co/600x400?text=No+Image'
        ) AS image_url,
        COALESCE(
          (
            SELECT epo.ecom_price 
            FROM "${session.schema}".ecom_price_overrides epo 
            WHERE epo.variant_id = pv.id AND epo.is_active = TRUE 
            LIMIT 1
          ),
          (
            SELECT final_selling_price 
            FROM "${session.schema}".product_pricing 
            WHERE variant_id = pv.id AND is_active = TRUE 
            LIMIT 1
          ),
          0.00
        ) AS effective_price,
        (
          SELECT unit_price 
          FROM "${session.schema}".product_pricing 
          WHERE variant_id = pv.id AND is_active = TRUE 
          LIMIT 1
        ) AS compare_at_price,
        COALESCE(
          (SELECT available_qty FROM "${session.schema}".ecom_available_stock WHERE variant_id = pv.id LIMIT 1),
          pv.qty,
          0
        ) AS available_qty
      FROM "${session.schema}".cart_items ci
      JOIN "${session.schema}".product_variants pv ON pv.id = ci.variant_id
      JOIN "${session.schema}".products p ON p.id = pv.product_id
      WHERE ci.customer_id = $1
      ORDER BY ci.updated_at DESC
    `;

    const res = await client.query(query, [session.customerId]);
    const items = res.rows.map((row: any) => ({
      id: String(row.variant_id),
      name: row.product_name,
      image: row.image_url,
      price: Number(row.effective_price || 0),
      quantity: Number(row.cart_quantity || 1),
      compareAtPrice: row.compare_at_price ? Number(row.compare_at_price) : undefined,
      inStock: Number(row.available_qty || 0) > 0,
    }));

    return NextResponse.json({ success: true, items });
  } catch (err: any) {
    console.error("Merge cart error:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  } finally {
    client.release();
  }
}
