// src/app/api/tenant/[company]/products/[variantId]/detail/route.ts
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { calculateEcomPricing } from "@/lib/ecomDiscount";
import { getNewArrivalVariantIds } from "@/lib/storefrontProducts";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ company: string; variantId: string }> }
) {
  const { company, variantId: rawVariantId } = await params;
  const companySlug = (company || "").trim().toLowerCase();
  const variantId = Number(rawVariantId || 0);

  if (!companySlug || !variantId) {
    return NextResponse.json(
      { success: false, message: "Company and valid variantId are required" },
      { status: 400 }
    );
  }

  const client = await pool.connect();
  try {
    // 1. Get tenant schema
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

    const { schema_name: schema, id: companyId } = tenantRes.rows[0];

    // Ensure specifications column exists on products if table was pre-existing
    await client.query(`ALTER TABLE "${schema}".products ADD COLUMN IF NOT EXISTS specifications JSONB DEFAULT '[]'::jsonb`);

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

    // Fetch theme configuration to extract curated New Arrivals variants
    const configRes = await client.query(
      `SELECT published_theme, draft_theme FROM "${schema}".storefront_config WHERE company_id = $1 LIMIT 1`,
      [companyId]
    );
    const themeConfig = configRes.rows[0]?.published_theme || configRes.rows[0]?.draft_theme || {};
    const newArrivalVariantIds = getNewArrivalVariantIds(themeConfig);

    // 2. Find target variant to get product_id
    const targetVariantRes = await client.query(
      `SELECT id, product_id FROM "${schema}".product_variants WHERE id = $1 LIMIT 1`,
      [variantId]
    );

    if (!targetVariantRes.rowCount) {
      return NextResponse.json(
        { success: false, message: "Product variant not found" },
        { status: 404 }
      );
    }

    const productId = targetVariantRes.rows[0].product_id;

    // 3. Fetch Product record
    const productRes = await client.query(
      `SELECT 
         p.id, p.product_code, p.name, p.description, 
         p.weight, p.length, p.width, p.height, p.specifications,
         pcat.path_string AS category_path,
         pcat.category_name AS category_name,
         mat.material_name AS material_name
       FROM "${schema}".products p
       LEFT JOIN "${schema}".product_categories pcat ON pcat.id = NULLIF(p.category, '')::integer
       LEFT JOIN "${schema}".product_materials mat ON mat.id = NULLIF(p.material, '')::integer
       WHERE p.id = $1 LIMIT 1`,
      [productId]
    );

    const productRecord = productRes.rows[0] || {};

    // 4. Fetch Product Images (both product-level and variant-level)
    const imagesRes = await client.query(
      `SELECT id, variant_id, image_url, is_primary, sort_order
       FROM "${schema}".product_images
       WHERE product_id = $1
       ORDER BY is_primary DESC, sort_order ASC, id ASC`,
      [productId]
    );

    const allImages = imagesRes.rows.map((r) => r.image_url);

    // 5. Fetch Sibling Variants with Active Discounts
    const variantsQuery = `
      SELECT
        pv.id AS variant_id,
        pv.product_id,
        pv.sku,
        pv.size,
        pv.gender,
        pf.fitting_name AS fitting,
        pv.low_stock_threshold,
        pv.barcode,
        pv.status,
        pc.color_name AS color,
        pc.hex_code AS color_hex,
        COALESCE(
          (
            SELECT epo.ecom_price 
            FROM "${schema}".ecom_price_overrides epo 
            WHERE epo.variant_id = pv.id AND epo.is_active = TRUE 
            LIMIT 1
          ),
          (
            SELECT pp.final_selling_price 
            FROM "${schema}".product_pricing pp 
            WHERE pp.variant_id = pv.id AND pp.is_active = TRUE 
            LIMIT 1
          ),
          0.00
        ) AS final_selling_price,
        (
          SELECT pp.unit_price 
          FROM "${schema}".product_pricing pp 
          WHERE pp.variant_id = pv.id AND pp.is_active = TRUE 
          LIMIT 1
        ) AS unit_price,
        (
          SELECT pp.tax_percent 
          FROM "${schema}".product_pricing pp 
          WHERE pp.variant_id = pv.id AND pp.is_active = TRUE 
          LIMIT 1
        ) AS tax_percent,
        COALESCE(
          (
            SELECT eas.available_qty 
            FROM "${schema}".ecom_available_stock eas 
            WHERE eas.variant_id = pv.id 
            LIMIT 1
          ),
          pv.qty,
          0
        ) AS available_qty,
        act_disc.discount_name,
        act_disc.discount_type,
        act_disc.discount_value
      FROM "${schema}".product_variants pv
      LEFT JOIN "${schema}".product_colors pc ON pc.id = pv.color_id
      LEFT JOIN "${schema}".product_fittings pf ON pf.id = pv.fitting_id
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
      WHERE pv.product_id = $1 AND pv.status = 'active'
      ORDER BY pv.id ASC
    `;

    const variantsRes = await client.query(variantsQuery, [productId]);

    const siblingVariants = variantsRes.rows.map((row) => {
      // Find variant-specific images, or fallback to all images
      const variantImages = imagesRes.rows
        .filter((img) => img.variant_id === row.variant_id)
        .map((img) => img.image_url);

      const images = variantImages.length > 0 ? variantImages : allImages;

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
        sku: row.sku,
        color: row.color || null,
        colorHex: row.color_hex || null,
        size: row.size || null,
        gender: row.gender || null,
        fitting: row.fitting || null,
        originalPrice: pricing.originalPrice,
        effectivePrice: pricing.effectivePrice,
        compareAtPrice: pricing.isOnSale ? pricing.originalPrice : undefined,
        isOnSale: pricing.isOnSale,
        discountValue: pricing.discountValue,
        discountType: pricing.discountType || null,
        discountBadgeText: pricing.discountBadgeText || null,
        savingsAmount: pricing.savingsAmount,
        availableQty: Number(row.available_qty || 0),
        lowStockThreshold: Number(row.low_stock_threshold || 5),
        inStock: Number(row.available_qty || 0) > 0,
        isNewArrival: newArrivalVariantIds.includes(Number(row.variant_id)),
        images: images.length > 0 ? images : ["https://placehold.co/600x400?text=No+Image+Available"],
      };
    });

    // 6. Fetch Footer Settings / Delivery info from ecom_settings
    const settingsRes = await client.query(
      `SELECT terms_and_conditions, return_refund_policy, delivery_note, support_email, support_phone
       FROM "${schema}".ecom_settings
       WHERE company_id = $1
       LIMIT 1`,
      [companyId]
    );

    const footerSettings = {
      termsAndConditions: settingsRes.rows[0]?.terms_and_conditions || "Standard delivery: 5 to 7 business days from date of order.",
      returnRefundPolicy: settingsRes.rows[0]?.return_refund_policy || "Products with stitching require an additional 4 to 5 business days.",
      deliveryNote: settingsRes.rows[0]?.delivery_note || "Standard delivery takes 5-7 business days.",
      supportEmail: settingsRes.rows[0]?.support_email || "support@merchant.com",
      supportPhone: settingsRes.rows[0]?.support_phone || "+91 98765 43210",
    };

    return NextResponse.json({
      success: true,
      product: {
        id: productRecord.id,
        productCode: productRecord.product_code,
        name: productRecord.name,
        description: productRecord.description || "",
        category: productRecord.category_path || productRecord.category_name || "Apparel",
        material: productRecord.material_name || null,
        weight: productRecord.weight ? Number(productRecord.weight) : null,
        length: productRecord.length ? Number(productRecord.length) : null,
        width: productRecord.width ? Number(productRecord.width) : null,
        height: productRecord.height ? Number(productRecord.height) : null,
        specifications: Array.isArray(productRecord.specifications) ? productRecord.specifications : [],
      },
      targetVariantId: variantId,
      variants: siblingVariants,
      footerSettings,
    });
  } catch (err: any) {
    console.error("Error fetching product detail:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Failed to load product details" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
