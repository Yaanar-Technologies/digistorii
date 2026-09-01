import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getStorefrontCustomerSession } from "@/lib/storefrontAuth";

async function fetchServerWishlistItems(client: any, schema: string, customerId: number) {
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
    FROM "${schema}".wishlist_items wi
    JOIN "${schema}".product_variants pv ON pv.id = wi.variant_id
    JOIN "${schema}".products p ON p.id = pv.product_id
    LEFT JOIN "${schema}".product_categories pcat ON pcat.id = NULLIF(p.category, '')::integer
    WHERE wi.customer_id = $1
    ORDER BY wi.added_at DESC
  `;

  const res = await client.query(query, [customerId]);

  return res.rows.map((row: any) => ({
    variantId: Number(row.variant_id),
    productName: row.product_name,
    category: row.category_path || row.category_name || "Apparel",
    image: row.image_url,
    price: Number(row.effective_price || 0),
    compareAtPrice: row.compare_at_price ? Number(row.compare_at_price) : undefined,
    inStock: Number(row.available_qty || 0) > 0,
  }));
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  const { company } = await params;
  const session = await getStorefrontCustomerSession(req, company);

  if (!session) {
    return NextResponse.json({ success: true, authenticated: false, items: [] });
  }

  const client = await pool.connect();
  try {
    const items = await fetchServerWishlistItems(client, session.schema, session.customerId);
    return NextResponse.json({ success: true, authenticated: true, items });
  } catch (err: any) {
    console.error("Fetch wishlist error:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Failed to fetch wishlist" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

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
  const variantId = Number(body.variantId || 0);

  if (!variantId) {
    return NextResponse.json({ success: false, message: "Valid variantId is required" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO "${session.schema}".wishlist_items (customer_id, variant_id, added_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (customer_id, variant_id) DO NOTHING`,
      [session.customerId, variantId]
    );

    const items = await fetchServerWishlistItems(client, session.schema, session.customerId);
    return NextResponse.json({ success: true, items });
  } catch (err: any) {
    console.error("Add wishlist item error:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Failed to add wishlist item" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  const { company } = await params;
  const session = await getStorefrontCustomerSession(req, company);

  if (!session) {
    return NextResponse.json({ success: false, message: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const variantIdParam = searchParams.get("variantId");
  const body = req.headers.get("content-type")?.includes("application/json") ? await req.json().catch(() => ({})) : {};
  const variantId = Number(variantIdParam || body.variantId || 0);

  if (!variantId) {
    return NextResponse.json({ success: false, message: "Valid variantId is required" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query(
      `DELETE FROM "${session.schema}".wishlist_items
       WHERE customer_id = $1 AND variant_id = $2`,
      [session.customerId, variantId]
    );

    const items = await fetchServerWishlistItems(client, session.schema, session.customerId);
    return NextResponse.json({ success: true, items });
  } catch (err: any) {
    console.error("Remove wishlist item error:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Failed to remove wishlist item" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
