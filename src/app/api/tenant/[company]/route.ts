// src/app/api/tenant/[company]/route.ts
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
    const result = await client.query(
      `SELECT c.id, c.company_name, c.schema_name, cs.ecommerce_access
       FROM public.companies c
       LEFT JOIN public.company_subscriptions cs ON cs.company_id = c.id
       WHERE c.subdomain_url = $1
       LIMIT 1`,
      [companySlug]
    );

    if (!result.rowCount) {
      return NextResponse.json(
        { success: false, message: `Tenant ${company} not found` },
        { status: 404 }
      );
    }

    const row = result.rows[0];
    if (!row.ecommerce_access) {
      return NextResponse.json(
        { success: false, message: "Ecommerce features not available for this tenant" },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Tenant ${row.company_name} loaded`,
      company_id: Number(row.id),
      schema_name: row.schema_name,
      company_name: row.company_name,
    });
  } catch (err: any) {
    console.error("Tenant API load error:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Failed to load tenant details" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
