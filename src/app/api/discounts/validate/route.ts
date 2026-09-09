import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTenantSchema, getTenantSchemaByCompany } from "@/lib/tenant";

async function resolveSchema(req: NextRequest): Promise<string> {
  try {
    const tenantInfo = await getTenantSchema(req);
    if (tenantInfo.schema) return tenantInfo.schema;
  } catch {
    // try fallback via header or query
  }

  const url = new URL(req.url);
  const tenantCompany = req.headers.get("x-tenant") || url.searchParams.get("company");
  if (tenantCompany) {
    const tenantInfo = await getTenantSchemaByCompany(tenantCompany);
    return tenantInfo.schema;
  }

  throw new Error("Tenant context missing");
}

async function handleValidate(code: string, dateStr?: string | null, req?: NextRequest) {
  if (!code || !code.trim()) {
    return NextResponse.json(
      { success: false, error: "Coupon code is required" },
      { status: 400 }
    );
  }

  const client = await pool.connect();
  try {
    const schema = await resolveSchema(req!);
    const checkDate = dateStr && !isNaN(new Date(dateStr).getTime())
      ? new Date(dateStr).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0];

    const result = await client.query(
      `
        SELECT
          d.id,
          d.name,
          d.description,
          d.discount_type,
          d.value,
          d.coupon_code,
          d.applies_to,
          d.priority,
          d.starts_at,
          d.ends_at,
          d.is_active,
          array_remove(array_agg(dv.variant_id), NULL) AS allowed_variants
        FROM "${schema}".discounts d
        LEFT JOIN "${schema}".discount_variants dv ON d.id = dv.discount_id
        WHERE d.is_active = TRUE
          AND LOWER(d.coupon_code) = LOWER($1)
          AND (d.starts_at IS NULL OR d.starts_at::date <= $2::date)
          AND (d.ends_at IS NULL OR d.ends_at::date >= $2::date)
        GROUP BY d.id
        LIMIT 1
      `,
      [code.trim(), checkDate]
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { success: false, error: "Invalid or expired coupon code" },
        { status: 404 }
      );
    }

    const row = result.rows[0];
    return NextResponse.json({
      success: true,
      data: {
        ...row,
        value: Number(row.value || 0),
        allowed_variants: (row.allowed_variants || []).map((id: any) => Number(id)),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to validate coupon" },
      { status: 400 }
    );
  } finally {
    client.release();
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code") || "";
  const date = searchParams.get("date");
  return handleValidate(code, date, req);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const code = body.code || body.coupon_code || "";
    const date = body.date || body.sales_date;
    return handleValidate(code, date, req);
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request payload" },
      { status: 400 }
    );
  }
}
