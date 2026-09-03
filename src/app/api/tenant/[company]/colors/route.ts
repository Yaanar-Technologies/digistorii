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
        color_name AS name,
        hex_code AS "hexCode",
        created_at
      FROM "${schema}".product_colors
      ORDER BY color_name ASC
    `);

    return NextResponse.json({
      success: true,
      colors: result.rows.map((r) => ({
        id: Number(r.id),
        name: r.name,
        hexCode: r.hexCode || "#000000",
      })),
    });
  } catch (err: any) {
    console.error("Colors fetch error:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Failed to fetch colors" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
