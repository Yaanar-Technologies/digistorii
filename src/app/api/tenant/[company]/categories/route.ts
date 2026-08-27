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

    const { schema_name: schema } = tenantRes.rows[0];

    const result = await client.query(
      `SELECT id, category_name
       FROM "${schema}".product_categories
       WHERE inactive_date IS NULL
       ORDER BY category_name ASC`
    );

    const categories = result.rows.map((row: any) => ({
      id: Number(row.id),
      name: row.category_name,
      slug: row.category_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
      image: "",
    }));

    return NextResponse.json({
      success: true,
      categories,
    });
  } catch (err: any) {
    console.error("Store categories API load error:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Failed to load categories" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
