//C:\Users\yanna\digistorii-ECom\src\app\api\company\ecom-theme\route.ts
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTenantSchema } from "@/lib/tenant";

export async function GET(req: NextRequest) {
  const client = await pool.connect();
  try {
    const { schema, companyId } = await getTenantSchema(req);

    // Fetch theme config
    const themeRes = await client.query(
      `SELECT * FROM "${schema}".storefront_config WHERE company_id = $1 LIMIT 1`,
      [companyId]
    );

    let theme = themeRes.rows[0] || null;
    if (!theme) {
      // Create default empty theme
      const insertRes = await client.query(
        `INSERT INTO "${schema}".storefront_config (company_id, draft_theme, version)
         VALUES ($1, '{}'::jsonb, 0)
         RETURNING *`,
        [companyId]
      );
      theme = insertRes.rows[0];
    }

    // Fetch settings setup status to verify if publish is allowed
    const settingsRes = await client.query(
      `SELECT setup_status FROM "${schema}".ecom_settings WHERE company_id = $1 LIMIT 1`,
      [companyId]
    );
    const setupStatus = settingsRes.rows[0]?.setup_status || "incomplete";

    return NextResponse.json({
      success: true,
      theme,
      is_setup_complete: setupStatus === "complete",
    });
  } catch (err: any) {
    console.error("GET ecom-theme error:", err);
    return NextResponse.json({ success: false, message: err.message || "Failed to fetch theme" }, { status: 400 });
  } finally {
    client.release();
  }
}

async function validateThemeReferences(client: any, schema: string, theme: any) {
  if (!theme || typeof theme !== "object") return;

  const categoryIds = new Set<number>();
  const colorIds = new Set<number>();
  const materialIds = new Set<number>();
  const discountIds = new Set<number>();
  const imageIds = new Set<number>();

  if (Array.isArray(theme.featured_category_ids)) {
    theme.featured_category_ids.forEach((id: any) => {
      const n = Number(id);
      if (!isNaN(n) && n > 0) categoryIds.add(n);
    });
  }

  if (Array.isArray(theme.nav_items)) {
    for (const item of theme.nav_items) {
      if (item.categoryId) {
        const n = Number(item.categoryId);
        if (!isNaN(n) && n > 0) categoryIds.add(n);
      }
      if (Array.isArray(item.collections)) {
        for (const col of item.collections) {
          if (col.kind === "color" && col.colorId) {
            const n = Number(col.colorId);
            if (!isNaN(n) && n > 0) colorIds.add(n);
          }
          if (col.kind === "material" && col.materialId) {
            const n = Number(col.materialId);
            if (!isNaN(n) && n > 0) materialIds.add(n);
          }
          if (col.imageId) {
            const n = Number(col.imageId);
            if (!isNaN(n) && n > 0) imageIds.add(n);
          }
        }
      }
    }
  }

  if (Array.isArray(theme.home_sections)) {
    for (const sec of theme.home_sections) {
      if (sec.type === "hero_carousel" && Array.isArray(sec.slides)) {
        for (const slide of sec.slides) {
          if (slide.imageId) {
            const n = Number(slide.imageId);
            if (!isNaN(n) && n > 0) imageIds.add(n);
          }
        }
      }
      if (sec.type === "shop_by_category") {
        if (Array.isArray(sec.categoryIds)) {
          sec.categoryIds.forEach((id: any) => {
            const n = Number(id);
            if (!isNaN(n) && n > 0) categoryIds.add(n);
          });
        }
        if (sec.overrides && typeof sec.overrides === "object") {
          Object.entries(sec.overrides).forEach(([k, v]: [string, any]) => {
            const n = Number(k);
            if (!isNaN(n) && n > 0) categoryIds.add(n);
            if (v?.imageId) {
              const imgN = Number(v.imageId);
              if (!isNaN(imgN) && imgN > 0) imageIds.add(imgN);
            }
          });
        }
      }
      if (sec.type === "shop_by_color" && Array.isArray(sec.items)) {
        for (const it of sec.items) {
          if (it.colorId) {
            const n = Number(it.colorId);
            if (!isNaN(n) && n > 0) colorIds.add(n);
          }
          if (it.imageId) {
            const n = Number(it.imageId);
            if (!isNaN(n) && n > 0) imageIds.add(n);
          }
        }
      }
      if (sec.type === "shop_by_material" && Array.isArray(sec.items)) {
        for (const it of sec.items) {
          if (it.materialId) {
            const n = Number(it.materialId);
            if (!isNaN(n) && n > 0) materialIds.add(n);
          }
          if (it.imageId) {
            const n = Number(it.imageId);
            if (!isNaN(n) && n > 0) imageIds.add(n);
          }
        }
      }
      if (sec.type === "offers") {
        if (Array.isArray(sec.discountIds)) {
          sec.discountIds.forEach((id: any) => {
            const n = Number(id);
            if (!isNaN(n) && n > 0) discountIds.add(n);
          });
        }
        if (sec.bannerImageId) {
          const n = Number(sec.bannerImageId);
          if (!isNaN(n) && n > 0) imageIds.add(n);
        }
      }
      if (sec.type === "about" && Array.isArray(sec.blocks)) {
        for (const b of sec.blocks) {
          if (b.imageId) {
            const n = Number(b.imageId);
            if (!isNaN(n) && n > 0) imageIds.add(n);
          }
        }
      }
    }
  }

  // Validate Categories
  if (categoryIds.size > 0) {
    const ids = Array.from(categoryIds);
    const res = await client.query(
      `SELECT id FROM "${schema}".product_categories WHERE id = ANY($1::bigint[])`,
      [ids]
    );
    const found = new Set(res.rows.map((r: any) => Number(r.id)));
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new Error(`Referenced category ID(s) [${missing.join(", ")}] do not exist`);
    }
  }

  // Validate Colors
  if (colorIds.size > 0) {
    const ids = Array.from(colorIds);
    const res = await client.query(
      `SELECT id FROM "${schema}".product_colors WHERE id = ANY($1::int[])`,
      [ids]
    );
    const found = new Set(res.rows.map((r: any) => Number(r.id)));
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new Error(`Referenced color ID(s) [${missing.join(", ")}] do not exist`);
    }
  }

  // Validate Materials
  if (materialIds.size > 0) {
    const ids = Array.from(materialIds);
    const res = await client.query(
      `SELECT id FROM "${schema}".product_materials WHERE id = ANY($1::int[])`,
      [ids]
    );
    const found = new Set(res.rows.map((r: any) => Number(r.id)));
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new Error(`Referenced material ID(s) [${missing.join(", ")}] do not exist`);
    }
  }

  // Validate Discounts
  if (discountIds.size > 0) {
    const ids = Array.from(discountIds);
    const res = await client.query(
      `SELECT id FROM "${schema}".discounts WHERE id = ANY($1::bigint[])`,
      [ids]
    );
    const found = new Set(res.rows.map((r: any) => Number(r.id)));
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new Error(`Referenced discount ID(s) [${missing.join(", ")}] do not exist`);
    }
  }

  // Validate Images
  if (imageIds.size > 0) {
    const ids = Array.from(imageIds);
    const res = await client.query(
      `SELECT id FROM "${schema}".image_master WHERE id = ANY($1::bigint[])`,
      [ids]
    );
    const found = new Set(res.rows.map((r: any) => Number(r.id)));
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new Error(`Referenced image ID(s) [${missing.join(", ")}] do not exist in image_master`);
    }
  }
}

export async function POST(req: NextRequest) {
  const client = await pool.connect();
  try {
    const { schema, companyId } = await getTenantSchema(req);
    const body = await req.json();
    const action = req.nextUrl.searchParams.get("action") || body.action || "";

    if (action === "publish") {
      // Publish flow
      await client.query("BEGIN");

      // 1. Verify settings complete
      const settingsRes = await client.query(
        `SELECT setup_status FROM "${schema}".ecom_settings WHERE company_id = $1 LIMIT 1`,
        [companyId]
      );
      const setupStatus = settingsRes.rows[0]?.setup_status || "incomplete";
      if (setupStatus !== "complete") {
        throw new Error("Storefront setup must be completed in Settings before publishing");
      }

      // 2. Fetch existing config
      const themeRes = await client.query(
        `SELECT draft_theme, version FROM "${schema}".storefront_config WHERE company_id = $1 LIMIT 1`,
        [companyId]
      );
      const currentTheme = themeRes.rows[0];
      const draftTheme = currentTheme?.draft_theme || {};

      // Validate references before publishing
      await validateThemeReferences(client, schema, draftTheme);

      const nextVersion = (currentTheme?.version || 0) + 1;
      const publisher = body.publisher || "Workspace User";

      // 3. Publish theme
      await client.query(
        `UPDATE "${schema}".storefront_config
         SET published_theme = draft_theme,
             version = $1,
             published_at = NOW(),
             published_by = $2,
             updated_at = NOW()
         WHERE company_id = $3`,
        [nextVersion, publisher, companyId]
      );

      // 4. Publish products (is_selected_draft -> is_live)
      await client.query(
        `UPDATE "${schema}".storefront_products
         SET is_live = is_selected_draft,
             updated_at = NOW()
         WHERE company_id = $1`,
        [companyId]
      );

      await client.query("COMMIT");
      return NextResponse.json({
        success: true,
        message: "Storefront configuration published successfully",
        version: nextVersion,
      });
    } else {
      // Save draft flow
      const { draft_theme } = body;
      if (!draft_theme) {
        return NextResponse.json({ success: false, message: "draft_theme is required" }, { status: 400 });
      }

      // Validate references on save
      await validateThemeReferences(client, schema, draft_theme);

      const existRes = await client.query(
        `SELECT id FROM "${schema}".storefront_config WHERE company_id = $1 LIMIT 1`,
        [companyId]
      );

      if (existRes.rowCount) {
        await client.query(
          `UPDATE "${schema}".storefront_config
           SET draft_theme = $1,
               updated_at = NOW()
           WHERE company_id = $2`,
          [JSON.stringify(draft_theme), companyId]
        );
      } else {
        await client.query(
          `INSERT INTO "${schema}".storefront_config (company_id, draft_theme, version)
           VALUES ($1, $2, 0)`,
          [companyId, JSON.stringify(draft_theme)]
        );
      }

      return NextResponse.json({ success: true, message: "Draft theme saved successfully" });
    }
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("POST ecom-theme error:", err);
    return NextResponse.json({ success: false, message: err.message || "Failed to process storefront action" }, { status: 400 });
  } finally {
    client.release();
  }
}

