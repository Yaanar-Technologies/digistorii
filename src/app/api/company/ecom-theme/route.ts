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
