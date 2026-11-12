import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { evaluateSubscriptionLifecycle, SubscriptionTierState } from "@/lib/subscription";

type ResolvedTenant = {
  company_id: number;
  schema_name: string;
  subdomain_url: string;
  subscription_state: SubscriptionTierState;
  days_remaining: number;
  is_storefront_blocked: boolean;
  is_checkout_blocked: boolean;
  show_admin_warning: boolean;
  warning_type: "warning" | "grace_period" | "suspended" | null;
  subscription_end: string | null;
  expiresAt: number;
};

// Fast in-memory cache for API routes
const cache = new Map<string, ResolvedTenant>();
const CACHE_TTL_MS = 10000; // 10 seconds TTL

export async function GET(req: NextRequest) {
  const host = req.nextUrl.searchParams.get("host") || "";
  const subdomain = req.nextUrl.searchParams.get("subdomain") || "";

  if (!host && !subdomain) {
    return NextResponse.json(
      { success: false, error: "Either host or subdomain query param is required" },
      { status: 400 }
    );
  }

  const cacheKey = host ? `host:${host}` : `subdomain:${subdomain}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ success: true, ...cached });
  }

  const client = await pool.connect();
  try {
    let result;
    const query = `
      SELECT 
        c.id, 
        c.schema_name, 
        c.subdomain_url, 
        c.status as company_status,
        cs.ecommerce_access,
        cs.subscription_end,
        cs.status as subscription_status,
        cs.payment_status
      FROM public.companies c
      LEFT JOIN public.company_subscriptions cs ON cs.company_id = c.id
    `;

    if (host) {
      const cleanHost = host.split(":")[0].toLowerCase().trim();
      result = await client.query(
        `${query}
         WHERE (
           c.id IN (
             SELECT company_id FROM public.tenant_domains
             WHERE LOWER(domain) = $1 AND verification_status = 'verified'
           )
           OR (LOWER(c.custom_domain) = $1 AND c.custom_domain_status = 'verified')
         )
         LIMIT 1`,
        [cleanHost]
      );
    } else {
      result = await client.query(
        `${query} WHERE LOWER(c.subdomain_url) = LOWER($1) LIMIT 1`,
        [subdomain]
      );
    }

    if (!result.rowCount) {
      return NextResponse.json(
        { success: false, error: "Tenant not found or ecom not configured" },
        { status: 404 }
      );
    }

    const row = result.rows[0];
    if (!row.ecommerce_access) {
      return NextResponse.json(
        { success: false, error: "E-commerce access is not enabled for this tenant" },
        { status: 403 }
      );
    }

    const subEval = evaluateSubscriptionLifecycle({
      subscriptionEndDate: row.subscription_end,
      subscriptionStatus: row.subscription_status || row.company_status,
      paymentStatus: row.payment_status,
    });

    const data: Omit<ResolvedTenant, "expiresAt"> = {
      company_id: Number(row.id),
      schema_name: row.schema_name,
      subdomain_url: row.subdomain_url,
      subscription_state: subEval.state,
      days_remaining: subEval.daysRemaining === Infinity ? 9999 : subEval.daysRemaining,
      is_storefront_blocked: subEval.isStorefrontBlocked,
      is_checkout_blocked: subEval.isCheckoutBlocked,
      show_admin_warning: subEval.showAdminWarning,
      warning_type: subEval.warningType,
      subscription_end: row.subscription_end ? new Date(row.subscription_end).toISOString() : null,
    };

    cache.set(cacheKey, { ...data, expiresAt: Date.now() + CACHE_TTL_MS });

    return NextResponse.json({ success: true, ...data });
  } catch (err: any) {
    console.error("Resolve tenant error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to resolve tenant" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
