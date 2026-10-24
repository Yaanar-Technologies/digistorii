import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { canAccess } from "@/lib/accessControl";
import type { ResponsibilityAccessKey } from "@/lib/userResponsibilities";
import { STAFF_COOKIE_NAME, StaffSessionPayload, verifySession } from "@/lib/session";

export type StaffGuardResult =
  | { ok: true; staff: StaffSessionPayload; schema: string; companyId: number }
  | { ok: false; response: NextResponse };

function deny(status: 401 | 403 | 404, error: string): StaffGuardResult {
  return { ok: false, response: NextResponse.json({ success: false, error }, { status }) };
}

/**
 * Guard for back-office APIs. The tenant comes from the company in the URL, is checked
 * against the signed staff session, and its schema is read from the database. Client
 * headers such as x-tenant / x-schema-name / x-user-name are never trusted.
 */
export async function requireStaff(
  req: NextRequest,
  company: string,
  options: { permission?: ResponsibilityAccessKey; requireEcom?: boolean } = {}
): Promise<StaffGuardResult> {
  const slug = String(company || "").trim().toLowerCase();
  const staff = await verifySession<StaffSessionPayload>(
    req.cookies.get(STAFF_COOKIE_NAME)?.value,
    "staff"
  );
  if (!staff) return deny(401, "Unauthorized: sign in required.");
  if (!slug || String(staff.company_name || "").trim().toLowerCase() !== slug) {
    return deny(403, "Forbidden: company mismatch.");
  }
  if (options.permission && !canAccess(staff.permissions, options.permission)) {
    return deny(403, "Forbidden: missing permission.");
  }

  const companyRow = await pool.query(
    `SELECT id, schema_name FROM public.companies WHERE subdomain_url = $1 LIMIT 1`,
    [slug]
  );
  if (!companyRow.rowCount) return deny(404, "Company not found.");
  const companyId = Number(companyRow.rows[0].id);
  if (Number(staff.company_id) !== companyId) {
    return deny(403, "Forbidden: company mismatch.");
  }

  if (options.requireEcom) {
    const sub = await pool.query(
      `SELECT ecommerce_access FROM public.company_subscriptions
       WHERE company_id = $1 ORDER BY updated_at DESC, id DESC LIMIT 1`,
      [companyId]
    );
    if (!sub.rows[0]?.ecommerce_access) {
      return deny(403, "Forbidden: your plan does not include e-commerce.");
    }
  }

  return { ok: true, staff, schema: String(companyRow.rows[0].schema_name), companyId };
}

export function staffDisplayName(staff: StaffSessionPayload): string {
  return staff.username || staff.email || staff.name || `user:${staff.user_id ?? staff.id}`;
}
