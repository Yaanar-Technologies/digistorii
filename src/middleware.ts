import { NextRequest, NextResponse } from "next/server";
import { canAccess, getFirstAccessiblePath, getRequiredPermissionForPath } from "./lib/accessControl";
import {
  verifySession,
  STAFF_COOKIE_NAME,
  ONBOARDING_COOKIE_NAME,
  StaffSessionPayload,
  OnboardingSessionPayload,
} from "./lib/session";

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
const PUBLIC_API_EXACT = ["/api/company"];
const PUBLIC_COMPANY_API = /^\/api\/[^/]+\/ecom\/(checkout|payment|webhooks)(\/|$)/;
const COMPANY_SCOPED_API = /^\/api\/([^/]+)\/(ecom|admin|upload)(\/|$)/;
// Lookups the onboarding wizard needs before the owner has a staff session.
const ONBOARDING_API_PREFIXES = ["/api/currencies", "/api/user-responsibilities", "/api/locations", "/api/warehouses"];
const TRUSTED_TENANT_HEADERS = ["x-tenant", "x-schema-name", "x-company-id", "x-user-name"];

async function resolveTenantBySlug(req: NextRequest, slug: string) {
  try {
    const res = await fetch(new URL(`/api/resolve-tenant?subdomain=${encodeURIComponent(slug)}`, req.url));
    if (!res.ok) return null;
    const body = await res.json();
    return body.success
      ? { companyId: String(body.company_id), schemaName: String(body.schema_name), tenant: String(body.subdomain_url) }
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
    const scoped = pathname.match(/^\/api\/(?:tenant|storefront)\/([^/]+)/) || pathname.match(/^\/api\/([^/]+)\/ecom\//);
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

  // /api/<company>/(ecom|admin|upload)/... must be for the signed-in company.
  const scopedCompany = pathname.match(COMPANY_SCOPED_API)?.[1]?.toLowerCase();
  if (scopedCompany && scopedCompany !== company) return jsonError(403, "Forbidden: company mismatch.");

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
    pathname.startsWith("/api/internal/") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Define platform hosts to check if it's a custom domain
  const isCustomDomain = !host.includes("localhost") && !host.includes("digistorii") && !host.includes("platform.com");

  // Let's resolve the tenant details
  let companyId = "";
  let schemaName = "";
  let tenant = "";

  const segments = pathname.split("/").filter(Boolean);

  if (isCustomDomain) {
    // 1. If it's a custom domain, look up by host name
    try {
      const res = await fetch(new URL(`/api/resolve-tenant?host=${host}`, req.url));
      if (res.ok) {
        const body = await res.json();
        if (body.success) {
          companyId = String(body.company_id);
          schemaName = body.schema_name;
          tenant = body.subdomain_url;
        }
      }
    } catch (e) {
      console.error("Middleware custom domain resolution failed:", e);
    }
  } else {
    // 2. Look up by path segment or headers (if it's a workspace API call with x-tenant)
    let subdomain = "";
    if (segments[0] === "digistorii" && segments[1]) {
      subdomain = segments[1];
    } else if (segments[0]) {
      subdomain = segments[0];
    } else {
      subdomain = req.headers.get("x-tenant") || "";
    }

    if (subdomain && subdomain !== "api" && subdomain !== "setup" && subdomain !== "get-service") {
      try {
        const res = await fetch(new URL(`/api/resolve-tenant?subdomain=${subdomain}`, req.url));
        if (res.ok) {
          const body = await res.json();
          if (body.success) {
            companyId = String(body.company_id);
            schemaName = body.schema_name;
            tenant = body.subdomain_url;
          }
        }
      } catch (e) {
        console.error("Middleware subdomain resolution failed:", e);
      }
    }
  }

  // Clone headers and inject resolved details
  const requestHeaders = new Headers(req.headers);
  if (tenant && schemaName && companyId) {
    requestHeaders.set("x-tenant", tenant);
    requestHeaders.set("x-schema-name", schemaName);
    requestHeaders.set("x-company-id", companyId);
  }

  // Rewrite paths if needed
  let effectivePathname = pathname;
  let shouldRewrite = false;

  if (isCustomDomain && tenant) {
    effectivePathname = `/${tenant}${pathname}`;
    shouldRewrite = true;
  } else if (segments[0] === "digistorii" && tenant) {
    effectivePathname = pathname.slice("/digistorii".length);
    shouldRewrite = true;
  }

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
      return NextResponse.rewrite(new URL(effectivePathname, req.url), {
        request: { headers: requestHeaders }
      });
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
      return NextResponse.rewrite(new URL(effectivePathname, req.url), {
        request: { headers: requestHeaders }
      });
    }
    return NextResponse.next({
      request: { headers: requestHeaders }
    });
  }

  // Check user and admin cookies using verifySession
  const userCookie = req.cookies.get(STAFF_COOKIE_NAME)?.value;
  const adminCookie = req.cookies.get("admin_user")?.value;

  // Storefront pages (e.g. /mycompany/store/...) do NOT require admin or workspace user authentication!
  const isStorefrontRoute = effectivePathname.includes(`/${company}/store`);
  if (isStorefrontRoute) {
    if (shouldRewrite) {
      return NextResponse.rewrite(new URL(effectivePathname, req.url), {
        request: { headers: requestHeaders }
      });
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
    return NextResponse.rewrite(new URL(effectivePathname, req.url), {
      request: { headers: requestHeaders }
    });
  }

  return NextResponse.next({
    request: { headers: requestHeaders }
  });
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"],
};
