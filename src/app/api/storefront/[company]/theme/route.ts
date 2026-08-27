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

    const result = await client.query(
      `SELECT published_theme, published_at, version
       FROM "${schema}".storefront_config
       WHERE company_id = $1
       LIMIT 1`,
      [companyId]
    );

    const configRow = result.rows[0];
    const publishedTheme = configRow ? configRow.published_theme : null;

    return NextResponse.json({
      success: true,
      published_theme: publishedTheme,
      version: configRow?.version || 0,
      published_at: configRow?.published_at || null,
    });
  } catch (err: any) {
    console.error("Storefront public theme load error:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Failed to load storefront theme" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
