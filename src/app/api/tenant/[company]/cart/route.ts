import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getStorefrontCustomerSession } from "@/lib/storefrontAuth";

async function fetchServerCartItems(client: any, schema: string, customerId: number) {
  const query = `
    SELECT 
      pv.id AS variant_id,
      p.name AS product_name,
      ci.quantity AS cart_quantity,
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
    FROM "${schema}".cart_items ci
    JOIN "${schema}".product_variants pv ON pv.id = ci.variant_id
    JOIN "${schema}".products p ON p.id = pv.product_id
    WHERE ci.customer_id = $1
    ORDER BY ci.updated_at DESC
  `;

  const res = await client.query(query, [customerId]);

  return res.rows.map((row: any) => ({
    id: String(row.variant_id),
    name: row.product_name,
    image: row.image_url,
    price: Number(row.effective_price || 0),
    quantity: Number(row.cart_quantity || 1),
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
    const items = await fetchServerCartItems(client, session.schema, session.customerId);
    return NextResponse.json({ success: true, authenticated: true, items });
  } catch (err: any) {
    console.error("Fetch cart error:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
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
  const variantId = Number(body.id || body.variantId || 0);
  const quantity = Math.max(1, Number(body.quantity || 1));

  if (!variantId) {
    return NextResponse.json({ success: false, message: "Valid variantId is required" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO "${session.schema}".cart_items (customer_id, variant_id, quantity, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (customer_id, variant_id)
       DO UPDATE SET quantity = "${session.schema}".cart_items.quantity + EXCLUDED.quantity, updated_at = NOW()`,
      [session.customerId, variantId, quantity]
    );

    const items = await fetchServerCartItems(client, session.schema, session.customerId);
    return NextResponse.json({ success: true, items });
  } catch (err: any) {
    console.error("Add cart item error:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  const { company } = await params;
  const session = await getStorefrontCustomerSession(req, company);

  if (!session) {
    return NextResponse.json({ success: false, message: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const variantId = Number(body.id || body.variantId || 0);
  const quantity = Number(body.quantity || 0);

  if (!variantId) {
    return NextResponse.json({ success: false, message: "Valid variantId is required" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    if (quantity <= 0) {
      await client.query(
        `DELETE FROM "${session.schema}".cart_items WHERE customer_id = $1 AND variant_id = $2`,
        [session.customerId, variantId]
      );
    } else {
      await client.query(
        `UPDATE "${session.schema}".cart_items
         SET quantity = $3, updated_at = NOW()
         WHERE customer_id = $1 AND variant_id = $2`,
        [session.customerId, variantId, quantity]
      );
    }

    const items = await fetchServerCartItems(client, session.schema, session.customerId);
    return NextResponse.json({ success: true, items });
  } catch (err: any) {
    console.error("Update cart item error:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
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
  const variantIdParam = searchParams.get("id") || searchParams.get("variantId");
  const body = req.headers.get("content-type")?.includes("application/json") ? await req.json().catch(() => ({})) : {};
  const variantId = Number(variantIdParam || body.id || body.variantId || 0);

  if (!variantId) {
    return NextResponse.json({ success: false, message: "Valid variantId is required" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query(
      `DELETE FROM "${session.schema}".cart_items WHERE customer_id = $1 AND variant_id = $2`,
      [session.customerId, variantId]
    );

    const items = await fetchServerCartItems(client, session.schema, session.customerId);
    return NextResponse.json({ success: true, items });
  } catch (err: any) {
    console.error("Delete cart item error:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  } finally {
    client.release();
  }
}
