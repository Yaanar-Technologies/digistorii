// Unauthenticated API sweep + cross-tenant header check.
// Usage: BASE_URL=http://localhost:3000 node scripts/api-auth-sweep.mjs
// Walks src/app/api, calls every route with no cookies and forged tenant headers,
// and fails if a back-office route answers anything other than 401/403/404/405.
import { readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const ROOT = join(process.cwd(), "src", "app", "api");

// Public by design (own guard: onboarding session, customer session, webhook signature, cron secret).
const PUBLIC = [
  /^\/api\/(setup|onboarding|create-order|plans|verify-company|resolve-tenant)(\/|$)/,
  /^\/api\/auth\/(login|logout|current-user|forgot-password|reset-password)$/,
  /^\/api\/admin\/(login|current-user)$/,
  /^\/api\/(ecom|storefront|tenant|internal)\//,
  /^\/api\/[^/]+\/ecom\/(checkout|payment|webhooks)(\/|$)/,
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name === "route.ts") out.push(full);
  }
  return out;
}

const routes = walk(ROOT).map((file) =>
  "/api/" + file.slice(ROOT.length + 1, -"/route.ts".length).split(sep).join("/").replace(/\[[^\]]+\]/g, "1")
);

let failures = 0;
for (const path of routes) {
  if (PUBLIC.some((re) => re.test(path))) continue;
  for (const method of ["GET", "POST"]) {
    const res = await fetch(BASE_URL + path, {
      method,
      headers: {
        "content-type": "application/json",
        "x-tenant": "victim",
        "x-schema-name": "tenant_1",
        "x-company-id": "1",
        "x-user-name": "attacker",
      },
      body: method === "POST" ? "{}" : undefined,
    });
    if (![401, 403, 404, 405].includes(res.status)) {
      failures++;
      console.error(`FAIL ${method} ${path} -> ${res.status}`);
    }
  }
}
console.log(failures ? `${failures} unprotected route(s)` : `OK: ${routes.length} routes checked`);
process.exit(failures ? 1 : 0);
