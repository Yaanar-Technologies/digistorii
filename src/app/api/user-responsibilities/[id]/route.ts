import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTenantSchema } from "@/lib/tenant";
import {
  RESPONSIBILITY_ACCESS_FIELDS,
  ensureCompanyResponsibilities,
  getResponsibilityById,
} from "@/lib/userResponsibilities";

function normalizeName(value: unknown) {
  return String(value || "").trim();
}

function normalizeBool(value: unknown) {
  return Boolean(value);
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const client = await pool.connect();
  try {
    const { company } = await getTenantSchema(req);
    const { id } = await context.params;
    const companyRes = await client.query(
      `SELECT id FROM public.companies WHERE subdomain_url = $1`,
      [company]
    );
    const companyId = Number(companyRes.rows[0]?.id || 0);
    const responsibilityId = Number(id || 0);
    if (!companyId || !responsibilityId) {
      return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 });
    }

    const responsibility = await getResponsibilityById(client, companyId, responsibilityId);
    if (!responsibility) {
      return NextResponse.json({ success: false, message: "Responsibility not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: responsibility });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to load responsibility" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    const { company } = await getTenantSchema(req);
    const { id } = await context.params;
    const companyRes = await client.query(
      `SELECT id FROM public.companies WHERE subdomain_url = $1`,
      [company]
    );
    const companyId = Number(companyRes.rows[0]?.id || 0);
    const responsibilityId = Number(id || 0);
    if (!companyId || !responsibilityId) {
      return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 });
    }

    const body = await req.json();
    const responsibilityName = normalizeName(body?.responsibility_name);
    if (!responsibilityName) {
      return NextResponse.json(
        { success: false, message: "Responsibility name is required" },
        { status: 400 }
      );
    }

    await client.query("BEGIN");
    transactionStarted = true;
    await ensureCompanyResponsibilities(client, companyId);

    const updateValues = RESPONSIBILITY_ACCESS_FIELDS.map((field) => normalizeBool(body?.[field]));
    const updated = await client.query(
      `UPDATE public.user_responsibilities
       SET
         responsibility_name = $3,
         dashboard_access = $4,
         purchase_access = $5,
         inventory_access = $6,
         sales_access = $7,
         sales_billing_access = $8,
         reports_access = $9,
         settings_access = $10,
      ecommerce_access = $11,
      is_system = $12,
         updated_at = NOW()
       WHERE company_id = $1 AND id = $2
       RETURNING
         id, company_id, responsibility_name, dashboard_access, purchase_access,
         inventory_access, sales_access, sales_billing_access, reports_access,
         settings_access, ecommerce_access, is_system`,
      [companyId, responsibilityId, responsibilityName, ...updateValues, normalizeBool(body?.is_system)]
    );

    if (!updated.rowCount) {
      await client.query("ROLLBACK");
      return NextResponse.json({ success: false, message: "Responsibility not found" }, { status: 404 });
    }

    await client.query("COMMIT");
    return NextResponse.json({ success: true, data: updated.rows[0] });
  } catch (error: any) {
    if (transactionStarted) {
      await client.query("ROLLBACK");
    }
    if (error?.code === "23505") {
      return NextResponse.json(
        { success: false, message: "Responsibility name already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, message: error.message || "Failed to update responsibility" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
