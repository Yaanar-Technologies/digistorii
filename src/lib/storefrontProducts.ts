import { pool } from "@/lib/db";
import { StorefrontTheme, StorefrontProduct, CategoryType, FooterSettings } from "@/components/storefront/types";
import { toStorefrontTheme } from "@/app/[company]/(user)/workspace/ecom-config/theme/page";
import { calculateEcomPricing } from "@/lib/ecomDiscount";

export function getNewArrivalVariantIds(themeConfig: any): number[] {
  if (!themeConfig || typeof themeConfig !== "object") return [];
  const homeSections = Array.isArray(themeConfig.home_sections)
    ? themeConfig.home_sections
    : Array.isArray(themeConfig.homeSections)
    ? themeConfig.homeSections
    : [];

  const newArrivalSection =
    homeSections.find(
      (s: any) =>
        s.type === "product_carousel" &&
        (String(s.title || "").toLowerCase().includes("new") || String(s.id || "").includes("new"))
    ) ||
    homeSections.find(
      (s: any) => s.type === "product_carousel" && Array.isArray(s.productVariantIds) && s.productVariantIds.length > 0
    ) ||
    homeSections.find((s: any) => s.type === "product_carousel");

  const ids: number[] = [];
  if (newArrivalSection && Array.isArray(newArrivalSection.productVariantIds)) {
    newArrivalSection.productVariantIds.forEach((id: any) => {
      const n = Number(id);
      if (!isNaN(n) && n > 0) ids.push(n);
    });
  }
  return ids;
}

export async function getStorefrontData(companySlug: string) {
  const slug = (companySlug || "").trim().toLowerCase();
  if (!slug) return null;

  const client = await pool.connect();
  try {
    // 1. Fetch company schema & ID
    const companyRes = await client.query(
      `SELECT c.id, c.schema_name, c.company_name
       FROM public.companies c
       WHERE LOWER(c.subdomain_url) = $1
       LIMIT 1`,
      [slug]
    );

    if (!companyRes.rowCount) return null;

    const { schema_name: schema, id: companyId, company_name: companyName } = companyRes.rows[0];

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

    // 2. Fetch Published Theme (or Draft theme fallback)
    const themeRes = await client.query(
      `SELECT published_theme, draft_theme
       FROM "${schema}".storefront_config
       WHERE company_id = $1
       LIMIT 1`,
      [companyId]
    );

    let rawThemeConfig = {};
    if (themeRes.rowCount) {
      rawThemeConfig = themeRes.rows[0].published_theme || themeRes.rows[0].draft_theme || {};
    }

    const theme: StorefrontTheme = {
      ...toStorefrontTheme(rawThemeConfig),
      logoUrl: (rawThemeConfig as any).logo_url || "",
    };

    // 3. Fetch Ecom Settings (Footer legal/support info)
    const settingsRes = await client.query(
      `SELECT terms_and_conditions, return_refund_policy, support_email, support_phone
       FROM "${schema}".ecom_settings
       WHERE company_id = $1
       LIMIT 1`,
      [companyId]
    );

    const footerSettings: FooterSettings = {
      termsAndConditions: settingsRes.rows[0]?.terms_and_conditions || "Standard merchant terms apply.",
      returnRefundPolicy: settingsRes.rows[0]?.return_refund_policy || "30-day return policy.",
      supportEmail: settingsRes.rows[0]?.support_email || "support@merchant.com",
      supportPhone: settingsRes.rows[0]?.support_phone || "+1 (800) 555-0199",
    };

    // 4. Fetch Active Categories
    const categoriesRes = await client.query(
      `SELECT id, category_name AS name
       FROM "${schema}".product_categories
       WHERE inactive_date IS NULL
       ORDER BY category_name ASC`
    );

    const categories: CategoryType[] = categoriesRes.rows.map((row) => ({
      id: String(row.id),
      name: row.name,
      slug: row.name.toLowerCase().replace(/\s+/g, "-"),
    }));

    // 5. Fetch Live Storefront Products with SQL Join & Active Discount
    const productsQuery = `
      SELECT
        pv.id AS variant_id,
        p.name AS product_name,
        p.description AS product_description,
        pcat.path_string AS category_path,
        pcat.category_name AS category_name,
        sp.sort_order,
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
        COALESCE(
          (
            SELECT ARRAY_AGG(pi.image_url ORDER BY pi.is_primary DESC, pi.id ASC)
            FROM "${schema}".product_images pi
            WHERE pi.product_id = p.id
          ),
          ARRAY[]::text[]
        ) AS images,
        act_disc.discount_name,
        act_disc.discount_type,
        act_disc.discount_value
      FROM "${schema}".product_variants pv
      INNER JOIN "${schema}".products p ON p.id = pv.product_id
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
      WHERE pv.status = 'active' AND sp.is_live = TRUE
      ORDER BY sp.sort_order ASC, p.name ASC
    `;

    const productsRes = await client.query(productsQuery);

    const products: StorefrontProduct[] = productsRes.rows.map((row) => {
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
        images:
          row.images && row.images.length > 0
            ? row.images
            : ["https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80"],
        originalPrice: pricing.originalPrice,
        effectivePrice: pricing.effectivePrice,
        compareAtPrice: pricing.isOnSale ? pricing.originalPrice : undefined,
        isOnSale: pricing.isOnSale,
        discountValue: pricing.discountValue,
        discountType: pricing.discountType || undefined,
        discountBadgeText: pricing.discountBadgeText || undefined,
        savingsAmount: pricing.savingsAmount,
        inStock: Number(row.available_qty || 0) > 0,
        sortOrder: Number(row.sort_order || 0),
        category: row.category_path || row.category_name || "General",
        description: row.product_description || "",
      };
    });

    return {
      companyId,
      companyName,
      schema,
      theme,
      footerSettings,
      categories,
      products,
    };
  } catch (err) {
    console.error("Error loading storefront data:", err);
    return null;
  } finally {
    client.release();
  }
}
