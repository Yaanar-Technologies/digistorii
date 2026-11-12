//C:\Users\yanna\digistorii-ECom\src\middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { canAccess, getFirstAccessiblePath, getRequiredPermissionForPath } from "./lib/accessControl";
import {
  verifySession,
  STAFF_COOKIE_NAME,
  ONBOARDING_COOKIE_NAME,
  StaffSessionPayload,
  OnboardingSessionPayload,
} from "./lib/session";
import { isReservedSlug } from "./lib/reservedSlugs";
import { parseDomainHostname } from "./lib/tenant/resolveDomain";

// API paths that need no staff sign-in. Each of these either has its own guard
// (onboarding session, customer session, webhook signature, cron secret) or is public by design.
const PUBLIC_API_PREFIXES = [
  "/api/setup",
  "/api/onboarding",
  "/api/create-order",
  "/api/plans",
  "/api/verify-company",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/current-user",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/admin/login",
  "/api/admin/current-user",
  "/api/ecom/",
  "/api/storefront/",
  "/api/tenant/",
];
// Exact paths only (sub-paths stay protected). /api/company returns just the display name for login pages.
const INTERNAL_ORIGIN = `http://127.0.0.1:${process.env.PORT || 3000}`;
const PUBLIC_API_EXACT = ["/api/company"];
const PUBLIC_COMPANY_API = /^\/api\/[^/]+\/(ecom\/(checkout|payment|webhooks|support|customer)|storefront)(\/|$)/;
const COMPANY_SCOPED_API = /^\/api\/([^/]+)\/(ecom|admin|upload)(\/|$)/;
// Lookups the onboarding wizard needs before the owner has a staff session.
const ONBOARDING_API_PREFIXES = ["/api/currencies", "/api/user-responsibilities", "/api/locations", "/api/warehouses"];
const TRUSTED_TENANT_HEADERS = ["x-tenant", "x-schema-name", "x-company-id", "x-user-name"];

async function resolveTenantBySlug(req: NextRequest, slug: string) {
  try {
    const res = await fetch(`${INTERNAL_ORIGIN}/api/resolve-tenant?subdomain=${encodeURIComponent(slug)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = await res.json();
    return body.success
      ? {
        companyId: String(body.company_id),
        schemaName: String(body.schema_name),
        tenant: String(body.subdomain_url),
        isStorefrontBlocked: Boolean(body.is_storefront_blocked),
        subscriptionState: String(body.subscription_state || "ACTIVE"),
      }
      : null;
  } catch {
    return null;
  }
}

function jsonError(status: number, error: string) {
  return NextResponse.json({ success: false, error, message: error }, { status });
}

/**
 * Tenant and identity headers are set here, from the signed session or the database.
 * Whatever the browser sent for them is discarded first.
 */
async function handleApi(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const headers = new Headers(req.headers);
  const clientTenant = (req.headers.get("x-tenant") || "").trim().toLowerCase();
  for (const name of TRUSTED_TENANT_HEADERS) headers.delete(name);

  const applyTenant = (tenant: { companyId: string; schemaName: string; tenant: string }) => {
    headers.set("x-tenant", tenant.tenant);
    headers.set("x-schema-name", tenant.schemaName);
    headers.set("x-company-id", tenant.companyId);
  };

  const isPublic =
    PUBLIC_API_EXACT.includes(pathname) ||
    PUBLIC_API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`)) ||
    PUBLIC_COMPANY_API.test(pathname);

  if (isPublic) {
    const scoped = pathname.match(/^\/api\/(?:tenant|storefront)\/([^/]+)/) || pathname.match(/^\/api\/([^/]+)\/(?:ecom|storefront)\//);
    const scopedSlug = scoped?.[1] && scoped[1] !== "auth" ? scoped[1] : "";
    const slug = (scopedSlug || clientTenant).toLowerCase();
    if (slug) {
      const tenant = await resolveTenantBySlug(req, slug);
      if (tenant) applyTenant(tenant);
    }
    return NextResponse.next({ request: { headers } });
  }

  const staff =
    (await verifySession<StaffSessionPayload>(req.cookies.get(STAFF_COOKIE_NAME)?.value, "staff")) ||
    (await verifySession<StaffSessionPayload>(req.cookies.get("admin_user")?.value, "staff"));

  let company = staff?.company_name ? String(staff.company_name).toLowerCase() : "";
  if (!staff && ONBOARDING_API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    const onboarding = await verifySession<OnboardingSessionPayload>(
      req.cookies.get(ONBOARDING_COOKIE_NAME)?.value,
      "onboarding"
    );
    company = onboarding?.company ? String(onboarding.company).toLowerCase() : "";
  }
  if (!company) return jsonError(401, "Unauthorized: sign in required.");

  // Skip non-company static utility routes from company mismatch check
  const NON_COMPANY_API_ROUTES = ["image-master", "image-master-v2", "pricing"];

  const scopedCompany = pathname.match(COMPANY_SCOPED_API)?.[1]?.toLowerCase();
  if (scopedCompany && !NON_COMPANY_API_ROUTES.includes(scopedCompany) && scopedCompany !== company) {
    return jsonError(403, "Forbidden: company mismatch.");
  }
  const tenant = await resolveTenantBySlug(req, company);
  if (!tenant) return jsonError(403, "Forbidden: unknown company.");
  applyTenant(tenant);
  if (staff?.username) headers.set("x-user-name", String(staff.username));
  return NextResponse.next({ request: { headers } });
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const host = req.headers.get("host") || "";

  if (pathname.startsWith("/api/resolve-tenant") || pathname.startsWith("/api/internal/")) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/api")) {
    return handleApi(req);
  }

  // Skip Next.js internal files, static assets, setup, cron routes
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/setup") ||
    pathname.startsWith("/get-service") ||
    pathname.startsWith("/store-suspended") ||
    pathname.startsWith("/api/internal/") ||
    pathname.startsWith("/favicon.ico") ||
    (pathname.includes(".") && !pathname.endsWith("/sitemap.xml") && !pathname.endsWith("/robots.txt"))
  ) {
    return NextResponse.next();
  }

  // Parse host to identify platform root or merchant custom domain
  const domainInfo = parseDomainHostname(host);
  const isCustomDomain = domainInfo.isCustomDomain;

  // Let's resolve the tenant details
  let companyId = "";
  let schemaName = "";
  let tenant = "";
  let isStorefrontBlocked = false;
  let subscriptionState = "ACTIVE";

  const segments = pathname.split("/").filter(Boolean);

  if (isCustomDomain) {
    // 1. If it's a custom domain, look up by hostname
    try {
      const res = await fetch(`${INTERNAL_ORIGIN}/api/resolve-tenant?host=${encodeURIComponent(domainInfo.hostname)}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const body = await res.json();
        if (body.success) {
          companyId = String(body.company_id);
          schemaName = body.schema_name;
          tenant = body.subdomain_url;
          isStorefrontBlocked = Boolean(body.is_storefront_blocked);
          subscriptionState = String(body.subscription_state || "ACTIVE");
        }
      }
    } catch (e) {
      console.error("Middleware custom domain resolution failed:", e);
    }
  } else {
    // 2. Platform root or local path routing (e.g., localhost:3000/tanviboutique or testdigistorii.workpro.cloud/tanviboutique)
    let subdomain = "";
    if (segments[0] === "digistorii" && segments[1]) {
      subdomain = segments[1];
    } else if (segments[0]) {
      subdomain = segments[0];
    } else {
      subdomain = req.headers.get("x-tenant") || "";
    }

    if (subdomain && !isReservedSlug(subdomain)) {
      try {
        const res = await fetch(`${INTERNAL_ORIGIN}/api/resolve-tenant?subdomain=${encodeURIComponent(subdomain)}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const body = await res.json();
          if (body.success) {
            companyId = String(body.company_id);
            schemaName = body.schema_name;
            tenant = body.subdomain_url;
            isStorefrontBlocked = Boolean(body.is_storefront_blocked);
            subscriptionState = String(body.subscription_state || "ACTIVE");
          }
        }
      } catch (e) {
        console.error("Middleware tenant resolution failed:", e);
      }
    }
  }

  // Clone headers and inject resolved details
  const requestHeaders = new Headers(req.headers);
  if (tenant && schemaName && companyId) {
    requestHeaders.set("x-tenant", tenant);
    requestHeaders.set("x-schema-name", schemaName);
    requestHeaders.set("x-company-id", companyId);
    requestHeaders.set("x-storefront-blocked", isStorefrontBlocked ? "1" : "0");
    requestHeaders.set("x-subscription-state", subscriptionState);
  }

  // Rewrite or redirect paths if needed
  let effectivePathname = pathname;
  let shouldRewrite = false;

  const DIRECT_COMPANY_ROUTES = new Set([
    "workspace",
    "admin",
    "store",
    "api",
    "track",
    "account",
    "policies",
    "robots.txt",
    "sitemap.xml",
  ]);

  if (isCustomDomain && tenant) {
    // Block /workspace and /admin routes on custom domains
    if (
      pathname === "/workspace" ||
      pathname.startsWith("/workspace/") ||
      pathname === "/admin" ||
      pathname.startsWith("/admin/") ||
      pathname.startsWith(`/${tenant}/workspace`) ||
      pathname.startsWith(`/${tenant}/admin`)
    ) {
      return new NextResponse("Not Found", { status: 404 });
    }

    // Hide /store on custom domains via redirect
    if (pathname === "/store" || pathname.startsWith("/store/")) {
      const stripped = pathname.slice("/store".length) || "/";
      const redirectUrl = new URL(stripped, req.url);
      redirectUrl.search = req.nextUrl.search;
      return NextResponse.redirect(redirectUrl);
    }
    if (pathname === `/${tenant}/store` || pathname.startsWith(`/${tenant}/store/`)) {
      const stripped = pathname.slice(`/${tenant}/store`.length) || "/";
      const redirectUrl = new URL(stripped, req.url);
      redirectUrl.search = req.nextUrl.search;
      return NextResponse.redirect(redirectUrl);
    }

    if (!pathname.startsWith(`/${tenant}`)) {
      if (
        pathname.startsWith("/account") ||
        pathname.startsWith("/checkout/payment-retry") ||
        pathname.startsWith("/policies") ||
        pathname.startsWith("/track") ||
        pathname === "/robots.txt" ||
        pathname === "/sitemap.xml"
      ) {
        effectivePathname = `/${tenant}${pathname}`;
      } else if (pathname === "/" || pathname === "") {
        effectivePathname = `/${tenant}/store`;
      } else {
        effectivePathname = `/${tenant}/store${pathname}`;
      }
      shouldRewrite = true;
    }
  } else if (segments[0] === "digistorii" && tenant) {
    effectivePathname = pathname.slice("/digistorii".length);
    shouldRewrite = true;
  } else if (tenant) {
    // Redirect /${company}/store (and subpaths) -> /${company} (and subpaths)
    const storePrefix = `/${tenant}/store`;
    if (pathname === storePrefix || pathname.startsWith(`${storePrefix}/`)) {
      const stripped = pathname.slice(storePrefix.length);
      const redirectUrl = new URL(`/${tenant}${stripped}`, req.url);
      redirectUrl.search = req.nextUrl.search;
      return NextResponse.redirect(redirectUrl);
    }

    // Internally rewrite /${company} and storefront subpaths to /${company}/store...
    const subSegment = segments[1] || "";
    const isDirectCheckoutSubroute = pathname.startsWith(`/${tenant}/checkout/payment-retry`);
    if (pathname === `/${tenant}` || pathname === `/${tenant}/`) {
      effectivePathname = `/${tenant}/store`;
      shouldRewrite = true;
    } else if (
      pathname.startsWith(`/${tenant}/`) &&
      !DIRECT_COMPANY_ROUTES.has(subSegment) &&
      !isDirectCheckoutSubroute
    ) {
      const rest = pathname.slice(`/${tenant}`.length);
      effectivePathname = `/${tenant}/store${rest}`;
      shouldRewrite = true;
    }
  }

  // Helper to rewrite internally while preserving search parameters
  const rewriteWithSearch = (targetPath: string) => {
    const targetUrl = new URL(targetPath, req.url);
    targetUrl.search = req.nextUrl.search;
    return NextResponse.rewrite(targetUrl, {
      request: { headers: requestHeaders },
    });
  };

  // If this is an API route, just pass it along with updated headers
  if (pathname.startsWith("/api")) {
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      }
    });
  }

  // For frontend pages, check authentication
  // Resolve effective company slug (either resolved tenant or first path segment)
  const company = tenant || (segments[0] === "digistorii" ? segments[1] : segments[0]);

  if (!company || company === "api" || company === "setup" || company === "get-service") {
    if (shouldRewrite) {
      return rewriteWithSearch(effectivePathname);
    }
    return NextResponse.next({
      request: { headers: requestHeaders }
    });
  }

  // If path is a login/reset path, let it pass
  const isLoginOrReset =
    effectivePathname.startsWith(`/${company}/workspace/login`) ||
    effectivePathname.startsWith(`/${company}/admin/login`) ||
    effectivePathname.startsWith(`/${company}/workspace/reset-password`) ||
    effectivePathname.startsWith(`/${company}/admin/reset-password`);

  if (isLoginOrReset) {
    if (shouldRewrite) {
      return rewriteWithSearch(effectivePathname);
    }
    return NextResponse.next({
      request: { headers: requestHeaders }
    });
  }

  // Check user and admin cookies using verifySession
  const userCookie = req.cookies.get(STAFF_COOKIE_NAME)?.value;
  const adminCookie = req.cookies.get("admin_user")?.value;

  // Storefront pages (e.g. /mycompany/store/..., /mycompany/policies/...) do NOT require admin or workspace user authentication!
  const isStorefrontRoute =
    effectivePathname.includes(`/${company}/store`) ||
    effectivePathname.includes(`/${company}/policies`) ||
    effectivePathname.includes(`/${company}/account`) ||
    effectivePathname.includes(`/${company}/checkout`) ||
    effectivePathname.includes(`/${company}/track`) ||
    (isCustomDomain && !effectivePathname.includes(`/${company}/workspace`) && !effectivePathname.includes(`/${company}/admin`));

  if (isStorefrontRoute) {
    // Hard cutoff / suspension: block storefront access and show /store-suspended
    if (isStorefrontBlocked && !effectivePathname.endsWith("/store-suspended")) {
      return NextResponse.rewrite(new URL("/store-suspended", req.url), {
        request: { headers: requestHeaders }
      });
    }

    if (shouldRewrite) {
      return rewriteWithSearch(effectivePathname);
    }
    return NextResponse.next({
      request: { headers: requestHeaders }
    });
  }

  // ADMIN ROUTES
  if (effectivePathname.startsWith(`/${company}/admin`)) {
    const adminUser = await verifySession<StaffSessionPayload>(adminCookie, "staff");
    if (!adminUser || adminUser?.company_name !== company) {
      return NextResponse.redirect(new URL(`/${company}/admin/login`, req.url));
    }
    const adminPath = effectivePathname.slice(`/${company}`.length);
    const requiredPermission = getRequiredPermissionForPath(adminPath);
    if (requiredPermission && !canAccess(adminUser?.permissions, requiredPermission)) {
      const fallbackPath = getFirstAccessiblePath(adminUser?.permissions);
      return NextResponse.redirect(
        new URL(fallbackPath ? `/${company}${fallbackPath}` : `/${company}/admin/login`, req.url)
      );
    }
  }

  // USER ROUTES
  if (effectivePathname.startsWith(`/${company}/workspace`)) {
    const currentUser = await verifySession<StaffSessionPayload>(userCookie, "staff");
    if (!currentUser || currentUser?.company_name !== company) {
      return NextResponse.redirect(new URL(`/${company}/workspace/login`, req.url));
    }
    const userPath = effectivePathname.slice(`/${company}`.length);
    const requiredPermission = getRequiredPermissionForPath(userPath);
    if (requiredPermission && !canAccess(currentUser?.permissions, requiredPermission)) {
      const fallbackPath = getFirstAccessiblePath(currentUser?.permissions);
      return NextResponse.redirect(
        new URL(fallbackPath ? `/${company}${fallbackPath}` : `/${company}/workspace/login`, req.url)
      );
    }
  }

  if (shouldRewrite) {
    return rewriteWithSearch(effectivePathname);
  }

  return NextResponse.next({
    request: { headers: requestHeaders }
  });
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"],
};
