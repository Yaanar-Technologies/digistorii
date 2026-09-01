import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  const { company } = await params;
  const companySlug = (company || "").trim().toLowerCase();

  if (!companySlug) {
    return NextResponse.json({ success: false, message: "Company is required" }, { status: 400 });
  }

  const body = await req.json();
  const inputItems = Array.isArray(body.items) ? body.items : [];

  if (inputItems.length === 0) {
    return NextResponse.json({ success: true, items: [] });
  }

  const variantIds = inputItems
    .map((i: any) => Number(i.variantId || i.id || 0))
    .filter((id: number) => id > 0);

  if (variantIds.length === 0) {
    return NextResponse.json({ success: true, items: [] });
  }

  const client = await pool.connect();
  try {
    const companyRes = await client.query(
      `SELECT schema_name FROM public.companies WHERE LOWER(subdomain_url) = $1 LIMIT 1`,
      [companySlug]
    );

    if (!companyRes.rowCount) {
      return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
    }

    const schema = companyRes.rows[0].schema_name;

    const query = `
      SELECT 
        pv.id AS variant_id,
        p.name AS product_name,
        pcat.path_string AS category_path,
        pcat.category_name AS category_name,
        COALESCE(
          (SELECT image_url FROM "${schema}".product_images WHERE variant_id = pv.id ORDER BY is_primary DESC, id ASC LIMIT 1),
          (SELECT image_url FROM "${schema}".product_images WHERE product_id = p.id ORDER BY is_primary DESC, id ASC LIMIT 1),
          'https://placehold.co/600x400?text=No+Image'
        ) AS image_url,
        COALESCE(
          (
            SELECT epo.ecom_price 
            FROM "${schema}".ecom_price_overrides epo 
            WHERE epo.variant_id = pv.id AND epo.is_active = TRUE 
            LIMIT 1
          ),
          (
            SELECT final_selling_price 
            FROM "${schema}".product_pricing 
            WHERE variant_id = pv.id AND is_active = TRUE 
            LIMIT 1
          ),
          0.00
        ) AS effective_price,
        (
          SELECT unit_price 
          FROM "${schema}".product_pricing 
          WHERE variant_id = pv.id AND is_active = TRUE 
          LIMIT 1
        ) AS compare_at_price,
        COALESCE(
          (SELECT available_qty FROM "${schema}".ecom_available_stock WHERE variant_id = pv.id LIMIT 1),
          pv.qty,
          0
        ) AS available_qty
      FROM "${schema}".product_variants pv
      JOIN "${schema}".products p ON p.id = pv.product_id
      LEFT JOIN "${schema}".product_categories pcat ON pcat.id = NULLIF(p.category, '')::integer
      WHERE pv.id = ANY($1::bigint[])
    `;

    const res = await client.query(query, [variantIds]);
    const liveMap = new Map<number, any>();

    res.rows.forEach((row: any) => {
      liveMap.set(Number(row.variant_id), {
        variantId: Number(row.variant_id),
        productName: row.product_name,
        category: row.category_path || row.category_name || "Apparel",
        image: row.image_url,
        price: Number(row.effective_price || 0),
        compareAtPrice: row.compare_at_price ? Number(row.compare_at_price) : undefined,
        inStock: Number(row.available_qty || 0) > 0,
      });
    });

    const updatedItems = inputItems
      .map((item: any) => {
        const vid = Number(item.variantId || item.id || 0);
        const live = liveMap.get(vid);
        if (!live) return null; // Item no longer exists
        return {
          ...item,
          variantId: vid,
          productName: live.productName,
          image: live.image || item.image,
          price: live.price,
          compareAtPrice: live.compareAtPrice,
          inStock: live.inStock,
        };
      })
      .filter(Boolean);

    return NextResponse.json({ success: true, items: updatedItems });
  } catch (err: any) {
    console.error("Verify wishlist items error:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  } finally {
    client.release();
  }
}
