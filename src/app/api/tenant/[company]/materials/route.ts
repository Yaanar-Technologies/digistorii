import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const runtime = "nodejs";

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
      `SELECT schema_name FROM public.companies WHERE LOWER(subdomain_url) = $1 LIMIT 1`,
      [companySlug]
    );

    if (!tenantRes.rowCount) {
      return NextResponse.json(
        { success: false, message: `Tenant ${company} not found` },
        { status: 404 }
      );
    }

    const schema = tenantRes.rows[0].schema_name;

    const result = await client.query(`
      SELECT
        id,
        material_code AS code,
        material_name AS name,
        created_at
      FROM "${schema}".product_materials
      ORDER BY material_name ASC
    `);

    return NextResponse.json({
      success: true,
      materials: result.rows.map((r) => ({
        id: Number(r.id),
        name: r.name,
        code: r.code,
      })),
    });
  } catch (err: any) {
    console.error("Materials fetch error:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Failed to fetch materials" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
