import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { verifySession, CUSTOMER_COOKIE_NAME, CustomerSessionPayload } from "@/lib/session";

export type StorefrontCustomerSession = {
  customerId: number;
  companySlug: string;
  schema: string;
};

export async function getStorefrontCustomerSession(
  req: NextRequest,
  companyParam?: string
): Promise<StorefrontCustomerSession | null> {
  const sessionCookie = req.cookies.get(CUSTOMER_COOKIE_NAME)?.value;
  if (!sessionCookie) return null;

  try {
    const session = await verifySession<CustomerSessionPayload>(sessionCookie, "customer");
    if (!session) return null;

    const companySlug = (companyParam || session.company || "").trim().toLowerCase();
    if (companyParam && session.company && session.company.trim().toLowerCase() !== companyParam.trim().toLowerCase()) {
      return null;
    }
    const customerId = Number(session.customerId || 0);

    if (!companySlug || !customerId) return null;

    const client = await pool.connect();
    try {
      const companyRes = await client.query(
        `SELECT schema_name FROM public.companies WHERE LOWER(subdomain_url) = $1 LIMIT 1`,
        [companySlug]
      );
      if (!companyRes.rowCount) return null;

      const schema = companyRes.rows[0].schema_name;

      const custRes = await client.query(
        `SELECT id FROM "${schema}".customers WHERE id = $1 LIMIT 1`,
        [customerId]
      );
      if (!custRes.rowCount) return null;

      return {
        customerId,
        companySlug,
        schema,
      };
    } finally {
      client.release();
    }
  } catch {
    return null;
  }
}
