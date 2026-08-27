# Phase 1.3 Bugfix — Public Storefront Not Reflecting Published Theme/Data

Files involved:
- `src/app/[company]/(store)/store/page.tsx` (public storefront home — buggy)
- `src/app/api/company/ecom-theme/route.ts` (theme API — auth-dependent,
  needs a public-safe equivalent)
- `src/app/api/tenant/[company]/products/route.ts` (products API — tenant
  resolution here is correct and public-safe; missing the stock join,
  see §2)

Confirmed symptoms: public `/store` page shows placeholder theme
("Discover Modern Lifestyle & Fashion", default logo) instead of the
published theme; no category nav; all products show in-stock regardless
of real stock. (Product images showing "Image Not Available" turned out
to be correct behavior, not a bug — see §3, no fix needed there.)

## 1. Theme fetch — reuse the products route's tenant-resolution pattern

`ecom-theme/route.ts` resolves the tenant via `getTenantSchema(req)`,
which works for the editor because that request is authenticated
(workspace session/cookie). The public store page hits the same route
anonymously, so tenant resolution likely fails or falls through — meaning
the fetch never returns real theme data and the page silently keeps its
`mockTheme` default. The store page's `?company=${company}` query param
is also never read by the route (it's not in `req.nextUrl.searchParams`
handling), so it does nothing either way.

The products route already solves this correctly for the public case —
copy its approach:
```
SELECT c.id, c.schema_name FROM public.companies c
WHERE c.subdomain_url = $1 LIMIT 1
```
resolving tenant purely from the `[company]` route param, no auth
dependency. Add a new public route, e.g.
`src/app/api/storefront/[company]/theme/route.ts`, using this same
lookup, and point the store page at it instead of
`/api/company/ecom-theme`. Leave the original authenticated
`ecom-theme/route.ts` untouched — the editor still needs it as-is.

Important: this new public route must only ever return `published_theme`
(never `draft_theme`) — it's public-facing, unlike the editor's GET
handler which intentionally returns both.

## 2. Products route — add the missing stock join

Current query joins `product_variants` → `products` → pricing/overrides
correctly, but never touches `ecom_available_stock` — there's no stock
join or field in the response at all. This is why `page.tsx` hardcodes
`inStock: true`: there's nothing real to map from.

Add to the query, e.g.:
```sql
COALESCE(
  (SELECT available_qty FROM "${schema}".ecom_available_stock
   WHERE variant_id = pv.id LIMIT 1),
  0
) AS available_qty
```
Include `available_qty` in the mapped response, then in `page.tsx` change:
```ts
inStock: true,
```
to:
```ts
inStock: Number(p.available_qty ?? 0) > 0,
```
This is what drives the out-of-stock badge / disabled-cart-button
behavior from 1.1A, which is currently silently broken for every product.


## 3. Categories — still missing, same as before

`categories` state in `page.tsx` is initialized to `[]` and never
fetched. Add a public categories endpoint (mirror the same tenant
resolution pattern as §1/§2, e.g.
`src/app/api/tenant/[company]/categories/route.ts` if it doesn't exist)
and wire the fetch into `page.tsx`. This is why the category nav bar and
`CategoryGrid` are missing and `ProductGrid` falls back to a different
layout than the editor preview.

## 4. Do not change in this pass

- The overall client-component architecture of the page (fetch-on-mount
  vs. server component) — separate, larger decision from the original 1.3
  spec; don't quietly convert it while fixing these bugs. Flag separately
  if you think it should change.
- Cart/checkout logic, `CustomerAuthModal` behavior — unaffected, leave
  as-is.
- The editor page (`ecom-config/theme/page.tsx`) and the authenticated
  `ecom-theme/route.ts` — both already correct, don't touch.

## 5. When done, tell me

- The new public theme route's path and confirm it only exposes
  `published_theme`.
- Confirm the stock join was added and out-of-stock badges now reflect
  real `available_qty`, not just a non-hardcoded `true`.
- Whether a categories endpoint already existed elsewhere that this page
  should've been calling, or whether you created a new one.