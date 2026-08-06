import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTenantSchema } from "@/lib/tenant";

export async function GET(req: NextRequest) {
  const client = await pool.connect();
  try {
    const { schema, companyId } = await getTenantSchema(req);

    // 1. Fetch products & variants with draft storefront selection & overrides
    // We join product_variants, products, storefront_products, and ecom_price_overrides
    const variantsResult = await client.query(
      `SELECT
        pv.id AS variant_id,
        pv.sku,
        pv.size,
        p.name AS product_name,
        p.product_code,
        p.category,
        pc.color_name,
        pc.hex_code AS color_hex,
        pf.fitting_name,
        -- POS base price
        COALESCE(
          (SELECT final_selling_price FROM "${schema}".product_pricing WHERE variant_id = pv.id AND is_active = TRUE LIMIT 1),
          0.00
        ) AS pos_price,
        -- storefront selected status
        COALESCE(sp.is_selected_draft, FALSE) AS is_selected_draft,
        COALESCE(sp.is_live, FALSE) AS is_live,
        COALESCE(sp.sort_order, 0) AS sort_order,
        -- price override status
        epo.ecom_price AS ecom_price_override,
        COALESCE(epo.is_active, FALSE) AS ecom_price_override_active
       FROM "${schema}".product_variants pv
       INNER JOIN "${schema}".products p ON p.id = pv.product_id
       LEFT JOIN "${schema}".product_colors pc ON pc.id = pv.color_id
       LEFT JOIN "${schema}".product_fittings pf ON pf.id = pv.fitting_id
       LEFT JOIN "${schema}".storefront_products sp ON sp.variant_id = pv.id
       LEFT JOIN "${schema}".ecom_price_overrides epo ON epo.variant_id = pv.id
       WHERE pv.status = 'active'
       ORDER BY p.name ASC, pv.sku ASC`
    );

    // 2. Fetch active discounts to modify their channels
    const discountsResult = await client.query(
      `SELECT id, name, discount_type, value, starts_at, ends_at, is_active, channel
       FROM "${schema}".discounts
       WHERE is_active = TRUE
       ORDER BY priority DESC, created_at DESC`
    );

    return NextResponse.json({
      success: true,
      variants: variantsResult.rows,
      discounts: discountsResult.rows,
    });
  } catch (err: any) {
    console.error("GET ecom-products error:", err);
    return NextResponse.json({ success: false, message: err.message || "Failed to fetch catalog" }, { status: 400 });
  } finally {
    client.release();
  }
}

export async function POST(req: NextRequest) {
  const client = await pool.connect();
  try {
    const { schema, companyId } = await getTenantSchema(req);
    const body = await req.json();

    const { selections, overrides, discounts } = body;
    // selections is array of { variant_id: number, is_selected_draft: boolean }
    // overrides is array of { variant_id: number, ecom_price: number | null }
    // discounts is array of { discount_id: number, channel: 'pos' | 'ecom' | 'both' }

    await client.query("BEGIN");

    // 1. Save product storefront draft selections
    if (Array.isArray(selections)) {
      for (const item of selections) {
        const { variant_id, is_selected_draft } = item;
        
        await client.query(
          `INSERT INTO "${schema}".storefront_products (company_id, variant_id, is_selected_draft, is_live)
           VALUES ($1, $2, $3, FALSE)
           ON CONFLICT (variant_id) DO UPDATE
           SET is_selected_draft = EXCLUDED.is_selected_draft,
               updated_at = NOW()`,
          [companyId, variant_id, is_selected_draft === true]
        );
      }
    }

    // 2. Save ecom price overrides
    if (Array.isArray(overrides)) {
      for (const item of overrides) {
        const { variant_id, ecom_price } = item;

        if (ecom_price === null || ecom_price === undefined || String(ecom_price).trim() === "") {
          // Deactivate or delete override
          await client.query(
            `UPDATE "${schema}".ecom_price_overrides
             SET is_active = FALSE, updated_at = NOW()
             WHERE variant_id = $1`,
            [variant_id]
          );
        } else {
          const price = Number(ecom_price);
          if (price < 0) {
            throw new Error("Price override cannot be negative");
          }

          await client.query(
            `INSERT INTO "${schema}".ecom_price_overrides (company_id, variant_id, ecom_price, is_active)
             VALUES ($1, $2, $3, TRUE)
             ON CONFLICT (variant_id) DO UPDATE
             SET ecom_price = EXCLUDED.ecom_price,
                 is_active = TRUE,
                 updated_at = NOW()`,
            [companyId, variant_id, price]
          );
        }
      }
    }

    // 3. Save discount channel configurations
    if (Array.isArray(discounts)) {
      for (const item of discounts) {
        const { discount_id, channel } = item;
        
        if (channel && ['pos', 'ecom', 'both'].includes(channel)) {
          await client.query(
            `UPDATE "${schema}".discounts
             SET channel = $1
             WHERE id = $2`,
            [channel, discount_id]
          );
        }
      }
    }

    await client.query("COMMIT");
    return NextResponse.json({ success: true, message: "Catalog selection and overrides saved successfully" });
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("POST ecom-products error:", err);
    return NextResponse.json({ success: false, message: err.message || "Failed to save product settings" }, { status: 400 });
  } finally {
    client.release();
  }
}
