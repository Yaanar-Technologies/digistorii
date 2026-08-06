//C:\Users\yanna\digistorii\src\lib\tenant.ts
import { pool } from "./db";
import { NextRequest } from "next/server";
export async function getTenantSchema(req: NextRequest) {
  const schemaHeader = req.headers.get("x-schema-name");
  const tenant = req.headers.get("x-tenant");
  const companyIdHeader = req.headers.get("x-company-id");

  if (schemaHeader && tenant) {
    return {
      company: tenant,
      schema: schemaHeader,
      companyId: companyIdHeader ? Number(companyIdHeader) : null
    };
  }
 
  if (!tenant) {
    throw new Error("Tenant header (x-tenant) is required");
  }
 
  const res = await pool.query(
    `SELECT id, schema_name
     FROM public.companies
     WHERE subdomain_url = $1`,
    [tenant]
  );
 
  if (res.rowCount === 0) {
    throw new Error(`Tenant not found for: ${tenant}`);
  }
 
  return {
    company : tenant,
    schema: res.rows[0].schema_name,
    companyId: Number(res.rows[0].id)
  };
}
export function normalizeSku(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildAutoSku(
  productCode: string,
  color: string,
  size: string
): string {
  const safeColor = normalizeSku(color || "NA");
  const safeSize = normalizeSku(size || "NA");
  return `${productCode}-${safeColor}-${safeSize}`;
}
