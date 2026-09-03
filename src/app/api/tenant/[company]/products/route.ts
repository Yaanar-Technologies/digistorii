// src/app/api/tenant/[company]/products/route.ts
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { calculateEcomPricing } from "@/lib/ecomDiscount";

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
       WHERE LOWER(c.subdomain_url) = $1
       LIMIT 1`,
      [companySlug]
    );

    if (!tenantRes.rowCount) {
      return NextResponse.json(
        { success: false, message: `Tenant ${company} not found` },
        { status: 404 }
      );
    }

    const { schema_name: schema } = tenantRes.rows[0];

    // Ensure discounts table has channel column if missing
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = '${schema}' AND table_name = 'discounts') THEN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = '${schema}' AND table_name = 'discounts' AND column_name = 'channel'
          ) THEN
            ALTER TABLE "${schema}".discounts ADD COLUMN channel VARCHAR(10) NOT NULL DEFAULT 'both';
          END IF;
        END IF;
      END $$;
    `);

    // Query parameters
    const url = req.nextUrl;
    const sortParam = url.searchParams.get("sort") || "";
    const limitParam = url.searchParams.get("limit");
    const categoryParam = url.searchParams.get("category") || "";
    const searchParam = url.searchParams.get("search") || "";
    const attributeParam = url.searchParams.get("attribute") || "";
    const valueIdParam = url.searchParams.get("value_id") || "";
    const colorIdParam = url.searchParams.get("color_id") || (attributeParam === "color" ? valueIdParam : "");
    const materialIdParam = url.searchParams.get("material_id") || (attributeParam === "material" ? valueIdParam : "");

    const conditions: string[] = ["pv.status = 'active'", "sp.is_live = TRUE"];
    const values: any[] = [];
    let valIdx = 1;

    if (categoryParam && categoryParam !== "all") {
      if (!isNaN(Number(categoryParam))) {
        conditions.push(`p.category = $${valIdx}`);
        values.push(categoryParam);
        valIdx++;
      } else {
        conditions.push(`(pcat.category_name ILIKE $${valIdx} OR pcat.path_string ILIKE $${valIdx} OR p.category ILIKE $${valIdx})`);
        values.push(`%${categoryParam}%`);
        valIdx++;
      }
    }

    if (colorIdParam && !isNaN(Number(colorIdParam))) {
      conditions.push(`pv.color_id = $${valIdx}`);
      values.push(Number(colorIdParam));
      valIdx++;
    }

    if (materialIdParam && !isNaN(Number(materialIdParam))) {
      conditions.push(`p.material = $${valIdx}`);
      values.push(materialIdParam);
      valIdx++;
    }

    if (searchParam) {
      conditions.push(`(p.name ILIKE $${valIdx} OR p.description ILIKE $${valIdx} OR pcat.category_name ILIKE $${valIdx})`);
      values.push(`%${searchParam}%`);
      valIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    let outerOrderBy = "ORDER BY sub.product_name ASC";
    if (sortParam === "new_arrivals" || sortParam === "newest") {
      outerOrderBy = "ORDER BY sub.created_at DESC";
    } else if (sortParam === "price_asc") {
      outerOrderBy = "ORDER BY sub.final_selling_price ASC";
    } else if (sortParam === "price_desc") {
      outerOrderBy = "ORDER BY sub.final_selling_price DESC";
    }

    let limitClause = "";
    if (limitParam && !isNaN(Number(limitParam)) && Number(limitParam) > 0) {
      limitClause = `LIMIT $${valIdx}`;
      values.push(Number(limitParam));
      valIdx++;
    }

    // 2. Fetch the storefront products that are live (is_live = true)
    const query = `
      SELECT * FROM (
        SELECT DISTINCT ON (p.id)
          pv.id AS variant_id,
          p.name AS product_name,
          p.created_at AS created_at,
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
          (
            SELECT unit_price 
            FROM "${schema}".product_pricing 
            WHERE variant_id = pv.id AND is_active = TRUE 
            LIMIT 1
          ) AS unit_price,
          (
            SELECT tax_percent 
            FROM "${schema}".product_pricing 
            WHERE variant_id = pv.id AND is_active = TRUE 
            LIMIT 1
          ) AS tax_percent,
          COALESCE(
            (SELECT available_qty FROM "${schema}".ecom_available_stock WHERE variant_id = pv.id LIMIT 1),
            0
          ) AS available_qty,
          act_disc.discount_name,
          act_disc.discount_type,
          act_disc.discount_value
        FROM "${schema}".products p
        INNER JOIN "${schema}".product_variants pv ON pv.product_id = p.id
        INNER JOIN "${schema}".storefront_products sp ON sp.variant_id = pv.id
        LEFT JOIN "${schema}".product_categories pcat ON pcat.id = NULLIF(p.category, '')::integer
        LEFT JOIN LATERAL (
          SELECT
            d.name AS discount_name,
            d.discount_type,
            d.value AS discount_value
          FROM "${schema}".discount_variants dv
          INNER JOIN "${schema}".discounts d ON d.id = dv.discount_id
          WHERE dv.variant_id = pv.id
            AND d.is_active = TRUE
            AND COALESCE(d.channel, 'both') IN ('ecom', 'both')
            AND (d.starts_at IS NULL OR d.starts_at <= NOW())
            AND (d.ends_at IS NULL OR d.ends_at >= NOW())
            AND d.coupon_code IS NULL
          ORDER BY d.priority ASC, d.value DESC, d.created_at DESC
          LIMIT 1
        ) act_disc ON true
        ${whereClause}
        ORDER BY p.id, pv.id ASC
      ) sub
      ${outerOrderBy}
      ${limitClause}
    `;

    const result = await client.query(query, values);

    const products = result.rows.map((row) => {
      const discountObj = row.discount_type && Number(row.discount_value) > 0
        ? {
            name: row.discount_name,
            discount_type: row.discount_type,
            value: Number(row.discount_value),
          }
        : null;

      const pricing = calculateEcomPricing(
        Number(row.final_selling_price || 0),
        row.unit_price != null ? Number(row.unit_price) : null,
        row.tax_percent != null ? Number(row.tax_percent) : null,
        discountObj
      );

      return {
        id: String(row.variant_id),
        products: {
          name: row.product_name,
          category: row.category_path || row.category_name || null,
        },
        product_pricing: {
          price: pricing.effectivePrice,
        },
        product_images: row.image_url ? [row.image_url] : ["https://placehold.co/600x400?text=Image+Not+Available"],
        available_qty: Number(row.available_qty || 0),
        // Additional discount fields
        original_price: pricing.originalPrice,
        effective_price: pricing.effectivePrice,
        is_on_sale: pricing.isOnSale,
        discount_value: pricing.discountValue,
        discount_type: pricing.discountType || null,
        discount_badge_text: pricing.discountBadgeText || null,
        savings_amount: pricing.savingsAmount,
      };
    });

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

