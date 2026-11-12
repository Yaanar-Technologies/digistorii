import { isReservedSlug } from "@/lib/reservedSlugs";

export interface ParsedDomain {
  isPlatformRoot: boolean;
  isPlatformSubdomain: boolean;
  isCustomDomain: boolean;
  slug: string | null;
  hostname: string;
}

const PLATFORM_BASE_DOMAINS = [
  "testdigistorii.workpro.cloud",
  "workpro.cloud",
  "digistorii.com",
  "localhost",
  "127.0.0.1",
];

// Short-TTL in-memory cache for resolved custom domains (60 seconds)
const domainCache = new Map<string, { slug: string | null; expiresAt: number }>();
const CACHE_TTL_MS = 60 * 1000;

function getAppBaseHostname(): string | null {
  const raw = process.env.NEXT_PUBLIC_APP_URL;
  if (!raw) return null;
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Pure parsing of incoming hostname without database overhead.
 * Identifies whether the request is targeting the root platform
 * or a verified custom merchant domain.
 */
export function parseDomainHostname(rawHost: string): ParsedDomain {
  const hostname = (rawHost || "").split(":")[0].toLowerCase().trim();
  const appHostname = getAppBaseHostname();

  // 1. Check exact platform root domains
  if (
    hostname === "testdigistorii.workpro.cloud" ||
    hostname === "workpro.cloud" ||
    hostname === "digistorii.com" ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "www.testdigistorii.workpro.cloud" ||
    hostname === "www.workpro.cloud" ||
    hostname === "www.digistorii.com" ||
    (appHostname && (hostname === appHostname || hostname === `www.${appHostname}`))
  ) {
    return {
      isPlatformRoot: true,
      isPlatformSubdomain: false,
      isCustomDomain: false,
      slug: null,
      hostname,
    };
  }

  // 2. Otherwise: external custom domain (e.g. pothys.com or shop.pothys.com)
  return {
    isPlatformRoot: false,
    isPlatformSubdomain: false,
    isCustomDomain: true,
    slug: null,
    hostname,
  };
}

/**
 * Resolves the merchant company slug from an incoming request hostname.
 * Handles platform subdomains, custom domains, and short-lived caching.
 */
export async function resolveCompanyFromDomain(
  rawHost: string,
  requestUrl?: string
): Promise<string | null> {
  const parsed = parseDomainHostname(rawHost);

  // If already a platform subdomain, slug is known immediately
  if (parsed.isPlatformSubdomain && parsed.slug) {
    return parsed.slug;
  }

  // If root platform, no tenant rewriting needed
  if (parsed.isPlatformRoot) {
    return null;
  }

  // Custom domain: Check in-memory cache
  const cached = domainCache.get(parsed.hostname);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.slug;
  }

  let resolvedSlug: string | null = null;

  // Attempt database query if pool is available in server context
  try {
    const { pool } = await import("@/lib/db");
    const result = await pool.query(
      `SELECT c.subdomain_url AS slug
       FROM public.tenant_domains td
       JOIN public.companies c ON c.id = td.company_id
       WHERE LOWER(td.domain) = $1 AND td.verification_status = 'verified'
       UNION
       SELECT subdomain_url AS slug
       FROM public.companies
       WHERE LOWER(custom_domain) = $1 AND custom_domain_status = 'verified'
       LIMIT 1`,
      [parsed.hostname]
    );

    if (result.rowCount && result.rowCount > 0) {
      resolvedSlug = (result.rows[0].slug || "").toLowerCase();
    }
  } catch {
    // If pool is unavailable (e.g., edge middleware), fetch via internal resolve-tenant API
    if (requestUrl) {
      try {
        const resolveUrl = new URL(`/api/resolve-tenant?host=${encodeURIComponent(parsed.hostname)}`, requestUrl);
        const res = await fetch(resolveUrl);
        if (res.ok) {
          const body = await res.json();
          if (body.success && body.subdomain_url) {
            resolvedSlug = String(body.subdomain_url).toLowerCase();
          }
        }
      } catch (fetchErr) {
        console.error("[resolveCompanyFromDomain] Internal fetch fallback failed:", fetchErr);
      }
    }
  }

  // Cache resolved slug (or negative cache for short period)
  domainCache.set(parsed.hostname, {
    slug: resolvedSlug,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return resolvedSlug;
}

