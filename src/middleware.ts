import { NextRequest, NextResponse } from "next/server";
import { canAccess, getFirstAccessiblePath, getRequiredPermissionForPath } from "./lib/accessControl";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const host = req.headers.get("host") || "";

  // Skip Next.js internal files, static assets, setup
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/setup") ||
    pathname.startsWith("/get-service") ||
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

  // Check user and admin cookies
  const user = req.cookies.get("user")?.value;
  const admin = req.cookies.get("admin_user")?.value;

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
    if (!admin) {
      return NextResponse.redirect(new URL(`/${company}/admin/login`, req.url));
    }
    try {
      const adminUser = JSON.parse(admin);
      if (adminUser?.company_name !== company) {
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
    } catch {
      return NextResponse.redirect(new URL(`/${company}/admin/login`, req.url));
    }
  }

  // USER ROUTES
  if (effectivePathname.startsWith(`/${company}/workspace`)) {
    if (!user) {
      return NextResponse.redirect(new URL(`/${company}/workspace/login`, req.url));
    }
    try {
      const currentUser = JSON.parse(user);
      if (currentUser?.company_name !== company) {
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
    } catch {
      return NextResponse.redirect(new URL(`/${company}/workspace/login`, req.url));
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
  matcher: ["/((?!_next|api|favicon.ico).*)"],
};
