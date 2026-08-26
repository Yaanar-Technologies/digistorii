import { pool } from "@/lib/db";
import { StorefrontTheme, StorefrontProduct, CategoryType, FooterSettings } from "@/components/storefront/types";
import { toStorefrontTheme } from "@/app/[company]/(user)/workspace/ecom-config/theme/page";

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

    // 5. Fetch Live Storefront Products with SQL Join
    const productsQuery = `
      SELECT
        pv.id AS variant_id,
        p.name AS product_name,
        p.description AS product_description,
        p.category AS category_name,
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
        ) AS effective_price,
        (
          SELECT pp.unit_price 
          FROM "${schema}".product_pricing pp 
          WHERE pp.variant_id = pv.id AND pp.is_active = TRUE 
          LIMIT 1
        ) AS compare_at_price,
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
        ) AS images
      FROM "${schema}".product_variants pv
      INNER JOIN "${schema}".products p ON p.id = pv.product_id
      INNER JOIN "${schema}".storefront_products sp ON sp.variant_id = pv.id
      WHERE pv.status = 'active' AND sp.is_live = TRUE
      ORDER BY sp.sort_order ASC, p.name ASC
    `;

    const productsRes = await client.query(productsQuery);

    const products: StorefrontProduct[] = productsRes.rows.map((row) => ({
      variantId: Number(row.variant_id),
      name: row.product_name,
      images:
        row.images && row.images.length > 0
          ? row.images
          : ["https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80"],
      effectivePrice: Number(row.effective_price || 0),
      compareAtPrice: row.compare_at_price ? Number(row.compare_at_price) : undefined,
      inStock: Number(row.available_qty || 0) > 0,
      sortOrder: Number(row.sort_order || 0),
      category: row.category_name || "General",
      description: row.product_description || "",
    }));

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
