import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { calculateEcomPricing } from "@/lib/ecomDiscount";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ company: string; variantId: string }> }
) {
  const { company, variantId: rawVariantId } = await params;
  const companySlug = (company || "").trim().toLowerCase();
  const variantId = Number(rawVariantId || 0);

  if (!companySlug || !variantId || isNaN(variantId)) {
    return NextResponse.json(
      { success: false, message: "Company and valid variantId are required." },
      { status: 400 }
    );
  }

  const client = await pool.connect();
  try {
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

    // Find current variant's category & material
    const currentRes = await client.query(
      `SELECT p.category, p.material, p.id AS product_id
       FROM "${schema}".product_variants pv
       JOIN "${schema}".products p ON p.id = pv.product_id
       WHERE pv.id = $1
       LIMIT 1`,
      [variantId]
    );

    const currentCat = currentRes.rows[0]?.category || "";
    const currentMat = currentRes.rows[0]?.material || "";
    const currentProdId = currentRes.rows[0]?.product_id || 0;

    // Fetch related products (same category or material, distinct on product, excluding current product/variant)
    const query = `
      SELECT DISTINCT ON (p.id)
        pv.id AS variant_id,
        p.id AS product_id,
        p.name AS product_name,
        pcat.path_string AS category_path,
        pcat.category_name AS category_name,
        COALESCE(
          (SELECT image_url FROM "${schema}".product_images WHERE product_id = p.id AND (variant_id = pv.id OR variant_id IS NULL) ORDER BY (variant_id = pv.id) DESC, is_primary DESC, id ASC LIMIT 1),
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
      WHERE pv.status = 'active'
        AND sp.is_live = TRUE
        AND pv.id <> $1
        AND p.id <> $2
        AND (
          ($3 <> '' AND p.category = $3)
          OR ($4 <> '' AND p.material = $4)
          OR ($3 = '' AND $4 = '')
        )
      ORDER BY p.id, pv.id ASC
      LIMIT 8
    `;

    let result = await client.query(query, [variantId, currentProdId, currentCat, currentMat]);

    // If fewer than 4 related items, fetch fallback live items
    if ((result.rowCount ?? 0) < 4) {
      const fallbackQuery = `
        SELECT DISTINCT ON (p.id)
          pv.id AS variant_id,
          p.id AS product_id,
          p.name AS product_name,
          pcat.path_string AS category_path,
          pcat.category_name AS category_name,
          COALESCE(
            (SELECT image_url FROM "${schema}".product_images WHERE product_id = p.id AND (variant_id = pv.id OR variant_id IS NULL) ORDER BY (variant_id = pv.id) DESC, is_primary DESC, id ASC LIMIT 1),
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
        WHERE pv.status = 'active'
          AND sp.is_live = TRUE
          AND pv.id <> $1
        ORDER BY p.id, pv.id ASC
        LIMIT 8
      `;
      result = await client.query(fallbackQuery, [variantId]);
    }

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
        variantId: Number(row.variant_id),
        name: row.product_name,
        category: row.category_path || row.category_name || "General",
        images: row.image_url ? [row.image_url] : ["https://placehold.co/600x400?text=Image+Not+Available"],
        originalPrice: pricing.originalPrice,
        effectivePrice: pricing.effectivePrice,
        compareAtPrice: pricing.isOnSale ? pricing.originalPrice : undefined,
        isOnSale: pricing.isOnSale,
        discountValue: pricing.discountValue,
        discountType: pricing.discountType,
        discountBadgeText: pricing.discountBadgeText,
        savingsAmount: pricing.savingsAmount,
        inStock: Number(row.available_qty || 0) > 0,
      };
    });

    return NextResponse.json({
      success: true,
      products,
    });
  } catch (err: any) {
    console.error("Related products API error:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Failed to load related products." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
