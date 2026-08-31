// src/app/api/tenant/[company]/products/route.ts
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  const { company } = await params;
  const companySlug = (company || "").trim().toLowerCase();

  if (!companySlug) {
    return NextResponse.json(
      { success: false, message: "Company parameter is required" },
      { status: 400 }
    );
  }

  const client = await pool.connect();
  try {
    // 1. Get the company schema
    const tenantRes = await client.query(
      `SELECT c.id, c.schema_name
       FROM public.companies c
       WHERE c.subdomain_url = $1
       LIMIT 1`,
      [companySlug]
    );

    if (!tenantRes.rowCount) {
      return NextResponse.json(
        { success: false, message: `Tenant ${company} not found` },
        { status: 404 }
      );
    }

    const { schema_name: schema, id: companyId } = tenantRes.rows[0];

    // 2. Fetch the storefront products that are live (is_live = true)
    // Map variant_id (as ID), products.name, final_selling_price, and images
    const query = `
      SELECT * FROM (
        SELECT DISTINCT ON (p.id)
          pv.id AS variant_id,
          p.name AS product_name,
          pcat.path_string AS category_path,
          pcat.category_name AS category_name,
          COALESCE(
            (SELECT image_url FROM "${schema}".product_images WHERE product_id = p.id ORDER BY is_primary DESC, id ASC LIMIT 1),
            ''
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
          ) AS final_selling_price,
          COALESCE(
            (SELECT available_qty FROM "${schema}".ecom_available_stock WHERE variant_id = pv.id LIMIT 1),
            0
          ) AS available_qty
        FROM "${schema}".products p
        INNER JOIN "${schema}".product_variants pv ON pv.product_id = p.id AND pv.status = 'active'
        INNER JOIN "${schema}".storefront_products sp ON sp.variant_id = pv.id AND sp.is_live = TRUE
        LEFT JOIN "${schema}".product_categories pcat ON pcat.id = NULLIF(p.category, '')::integer
        ORDER BY p.id, pv.id ASC
      ) sub
      ORDER BY sub.product_name ASC
    `;

    const result = await client.query(query);

    const products = result.rows.map((row) => ({
      id: String(row.variant_id),
      products: {
        name: row.product_name,
        category: row.category_path || row.category_name || null,
      },
      product_pricing: {
        price: Number(row.final_selling_price || 0),
      },
      product_images: row.image_url ? [row.image_url] : ["https://placehold.co/600x400?text=Image+Not+Available"],
      available_qty: Number(row.available_qty || 0),
    }));

    return NextResponse.json({
      success: true,
      products,
    });
  } catch (err: any) {
    console.error("Store products API load error:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Failed to load products" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
