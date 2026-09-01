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
      const variantId = Number(item.variantId || item.id || 0);
      if (variantId > 0) {
        await client.query(
          `INSERT INTO "${session.schema}".wishlist_items (customer_id, variant_id, added_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (customer_id, variant_id) DO NOTHING`,
          [session.customerId, variantId]
        );
      }
    }

    // Refetch full authoritative list
    const query = `
      SELECT 
        pv.id AS variant_id,
        p.name AS product_name,
        pcat.path_string AS category_path,
        pcat.category_name AS category_name,
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
      FROM "${session.schema}".wishlist_items wi
      JOIN "${session.schema}".product_variants pv ON pv.id = wi.variant_id
      JOIN "${session.schema}".products p ON p.id = pv.product_id
      LEFT JOIN "${session.schema}".product_categories pcat ON pcat.id = NULLIF(p.category, '')::integer
      WHERE wi.customer_id = $1
      ORDER BY wi.added_at DESC
    `;

    const res = await client.query(query, [session.customerId]);
    const items = res.rows.map((row: any) => ({
      variantId: Number(row.variant_id),
      productName: row.product_name,
      category: row.category_path || row.category_name || "Apparel",
      image: row.image_url,
      price: Number(row.effective_price || 0),
      compareAtPrice: row.compare_at_price ? Number(row.compare_at_price) : undefined,
      inStock: Number(row.available_qty || 0) > 0,
    }));

    return NextResponse.json({ success: true, items });
  } catch (err: any) {
    console.error("Merge wishlist error:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Failed to merge wishlist" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
