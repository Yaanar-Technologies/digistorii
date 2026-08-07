import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTenantSchema } from "@/lib/tenant";
import {
  RESPONSIBILITY_ACCESS_FIELDS,
  ensureCompanyResponsibilities,
  getResponsibilitiesForCompany,
} from "@/lib/userResponsibilities";

function normalizeName(value: unknown) {
  return String(value || "").trim();
}

function normalizeBool(value: unknown) {
  return Boolean(value);
}

export async function GET(req: NextRequest) {
  const client = await pool.connect();
  try {
    const { company } = await getTenantSchema(req);
    const companyRes = await client.query(
      `SELECT id FROM public.companies WHERE subdomain_url = $1`,
      [company]
    );
    const companyId = Number(companyRes.rows[0]?.id || 0);
    if (!companyId) {
      return NextResponse.json({ success: false, message: "Company not found" }, { status: 404 });
    }

    const data = await getResponsibilitiesForCompany(client, companyId);
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to load responsibilities" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

export async function POST(req: NextRequest) {
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    const { company } = await getTenantSchema(req);
    const companyRes = await client.query(
      `SELECT id FROM public.companies WHERE subdomain_url = $1`,
      [company]
    );
    const companyId = Number(companyRes.rows[0]?.id || 0);
    if (!companyId) {
      return NextResponse.json({ success: false, message: "Company not found" }, { status: 404 });
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

    const insertValues = RESPONSIBILITY_ACCESS_FIELDS.map((field) => normalizeBool(body?.[field]));
    const inserted = await client.query(
      `INSERT INTO public.user_responsibilities
       (
         company_id, responsibility_name, dashboard_access, purchase_access,
         inventory_access, sales_access, sales_billing_access, reports_access,
         settings_access, ecommerce_access, is_system, created_at, updated_at
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())
       RETURNING
         id, company_id, responsibility_name, dashboard_access, purchase_access,
         inventory_access, sales_access, sales_billing_access, reports_access,
        settings_access, ecommerce_access, is_system`,
      [companyId, responsibilityName, ...insertValues, normalizeBool(body?.is_system)]
    );

    await client.query("COMMIT");
    return NextResponse.json({ success: true, data: inserted.rows[0] });
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
      { success: false, message: error.message || "Failed to create responsibility" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
