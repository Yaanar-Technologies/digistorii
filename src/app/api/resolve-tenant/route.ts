import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

type ResolvedTenant = {
  company_id: number;
  schema_name: string;
  subdomain_url: string;
  expiresAt: number;
};

// Fast in-memory cache for API routes
const cache = new Map<string, ResolvedTenant>();
const CACHE_TTL_MS = 10000; // 10 seconds TTL

export async function GET(req: NextRequest) {
  const host = req.nextUrl.searchParams.get("host") || "";
  const subdomain = req.nextUrl.searchParams.get("subdomain") || "";

  if (!host && !subdomain) {
    return NextResponse.json({ success: false, error: "Either host or subdomain query param is required" }, { status: 400 });
  }

  const cacheKey = host ? `host:${host}` : `subdomain:${subdomain}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ success: true, ...cached });
  }

  const client = await pool.connect();
  try {
    let result;
    if (host) {
      // Lookup by verified custom domain
      result = await client.query(
        `SELECT c.id, c.schema_name, c.subdomain_url, cs.ecommerce_access
         FROM public.companies c
         LEFT JOIN public.company_subscriptions cs ON cs.company_id = c.id
         WHERE c.custom_domain = $1 AND c.custom_domain_status = 'verified'
         LIMIT 1`,
        [host]
      );
    } else {
      // Lookup by subdomain slug
      result = await client.query(
        `SELECT c.id, c.schema_name, c.subdomain_url, cs.ecommerce_access
         FROM public.companies c
         LEFT JOIN public.company_subscriptions cs ON cs.company_id = c.id
         WHERE c.subdomain_url = $1
         LIMIT 1`,
        [subdomain]
      );
    }

    if (!result.rowCount) {
      return NextResponse.json({ success: false, error: "Tenant not found or ecom not configured" }, { status: 404 });
    }

    const row = result.rows[0];
    if (!row.ecommerce_access) {
      return NextResponse.json({ success: false, error: "E-commerce access is not enabled for this tenant" }, { status: 403 });
    }

    const data: Omit<ResolvedTenant, 'expiresAt'> = {
      company_id: Number(row.id),
      schema_name: row.schema_name,
      subdomain_url: row.subdomain_url,
    };

    cache.set(cacheKey, { ...data, expiresAt: Date.now() + CACHE_TTL_MS });

    return NextResponse.json({ success: true, ...data });
  } catch (err: any) {
    console.error("Resolve tenant error:", err);
    return NextResponse.json({ success: false, error: err.message || "Failed to resolve tenant" }, { status: 500 });
  } finally {
    client.release();
  }
}
