# Fix Prompt: Product Listing & Product Detail Issues

## Context
Multi-tenant e-commerce app (Next.js API routes + Postgres, schema-per-tenant).
Relevant files:
- `src/app/api/tenant/[company]/products/route.ts` — storefront product **listing**
- `src/app/api/tenant/[company]/products/[variantId]/detail/route.ts` — product **detail**
- `src/app/api/tenant/[company]/categories/route.ts` — category list
- `src\components\storefront\ProductDetail.tsx`,`src\components\storefront\ProductGrid.tsx` Frontend product listing page + product detail page (some paths are not shown here — locate the components that render `ADD TO CART`, the color/size selector, and the "Product Details" icon grid)

---

## Issue 1 — Category and Material show as raw IDs, not names

**Symptom:** Product detail page shows `5` instead of `Silk > Banaras`, and material shows `2` instead of `Pure Silk`(according to each tenant's table `product_categoriess` and `product_materials`).

**Root cause:** `products.category` and `products.material` store foreign-key IDs referencing `product_categories.id` and a `product_materials.id` table.The detail route's SELECT pulls these columns raw with no JOIN:
```sql
SELECT id, product_code, name, description, category, material, weight, length, width, height, specifications
FROM "${schema}".products
WHERE id = $1 LIMIT 1
```

**Fix:**
1. Confirm `products.category` and `products.material` are integer FK columns (not text codes). If they're currently text/varchar, note that and adjust join condition accordingly.
2. Update the product query in `detail/route.ts` to LEFT JOIN both lookup tables:
```sql
SELECT
  p.id, p.product_code, p.name, p.description,
  p.weight, p.length, p.width, p.height, p.specifications,
  pcat.path_string AS category_path,
  pcat.category_name AS category_name,
  mat.material_name AS material_name
FROM "${schema}".products p
LEFT JOIN "${schema}".product_categories pcat ON pcat.id = p.category
LEFT JOIN "${schema}".product_materials mat ON mat.id = p.material
WHERE p.id = $1 LIMIT 1
```
3. Update the response mapping to return `category: productRecord.category_path || productRecord.category_name` and `material: productRecord.material_name`, replacing the current raw pass-through.
4. Do the same resolution anywhere else category/material IDs are surfaced (e.g. filters, listing page facets) — grep the codebase for `.category` / `.material` usage on product rows same goes to categories headers

**Acceptance criteria:** Wedding Banaras Saree detail page shows `Silk > Banaras` instead of `5`, and material shows `Pure Silk` instead of `2`.

---

## Issue 2 — Listing page shows duplicate cards per variant instead of one card per product

**Symptom:** "Wedding Banaras Saree" appears twice on the product grid (screenshot 2) because it has multiple variants.

**Root cause:** `\src\app\api\products\route.ts` queries `product_variants` (one row per variant) joined to `products`, and never groups by product:
```sql
FROM "${schema}".product_variants pv
INNER JOIN "${schema}".products p ON p.id = pv.product_id
INNER JOIN "${schema}".storefront_products sp ON sp.variant_id = pv.id
WHERE pv.status = 'active' AND sp.is_live = TRUE
```

**Fix:**
1. Change the listing query to group by `p.id` (product), not variant. Pick one **representative variant** per product for the card's price/image/link — e.g. the lowest-id active variant, or a variant flagged `is_default`/`is_primary` if that column exists.
2. Suggested approach:
```sql
SELECT DISTINCT ON (p.id)
  p.id AS product_id,
  pv.id AS variant_id,
  p.name AS product_name,
  ... same price/stock subqueries keyed off pv.id ...
FROM "${schema}".products p
INNER JOIN "${schema}".product_variants pv ON pv.product_id = p.id AND pv.status = 'active'
INNER JOIN "${schema}".storefront_products sp ON sp.variant_id = pv.id AND sp.is_live = TRUE
ORDER BY p.id, pv.id ASC
```
3. Card should link to the detail route using this representative `variant_id`, same as today — the detail route already correctly expands to all sibling variants, so no change needed there.
4. If a product has zero live/active variants, it should be excluded entirely (this should already happen naturally via the INNER JOINs — just confirm after the grouping change).

**Acceptance criteria:** Each distinct product appears exactly once in the listing grid, regardless of how many color/size variants it has. Clicking it still lands on the detail page showing all variants.

---

## Issue 3 — Color/size selector should only show when there's more than one option

**Symptom:** Single-color products (e.g. Yellow Banaras Raw Silk Saree, screenshot 3) either show a blank/awkward color row or none at all — needs to be a deliberate conditional, not an accident of falsy values.

**Fix (frontend, wherever `siblingVariants` from the detail API is rendered):**
1. Derive unique value sets from `variants[]`: `const uniqueColors = [...new Set(variants.map(v => v.color).filter(Boolean))]`. Same pattern for `size`.
2. Only render the "COLOR: X" label + swatch buttons if `uniqueColors.length > 1`.
3. Only render the size selector if `uniqueSizes.length > 1`.
4. If there's exactly one color/size, you can optionally still show it as plain static text (not a selector) if you want the info visible — decide and confirm with product team, but at minimum stop rendering an interactive selector with a single option.
5. Same logic should apply to `gender` and `fitting` if those are ever used as selectors rather than static spec fields.

**Acceptance criteria:** Single-variant-color products show no color selector (or a plain non-interactive label, per your choice). Multi-color products behave as today (screenshot 1, working correctly).

---

## Issue 4 — Specification icon-badge grid is too bulky

**Symptom:** The "Product Details" section renders Material/Fitting/Gender/Weight as separate bordered icon cards, taking excessive vertical space.

**Fix (frontend component only, no API change needed):**
1. Replace the icon-card grid with a simple two-column definition table/list:
```
Material     Pure Silk
Fitting      Regular
Gender       Female
Weight       1kg
```
2. Use a compact `<table>` or flex row-list with label/value pairs, minimal padding, no icons or bordered boxes — matching whatever "previous design" looked like if you have a reference screenshot/commit to point the assistant to.
3. Only render rows where the value is present (skip empty fields like `null` category/material instead of showing "—").
4. Apply the same compact styling in both product detail and any quick-view/modal that reuses this component.

**Acceptance criteria:** Product Details section is visually compact — a plain label/value table instead of icon cards — and doesn't push content below the fold.

---

## Suggested order of work
1. Issue 1 (data correctness — category/material joins) — backend only, no frontend impact.
2. Issue 2 (listing dedup) — backend query change, verify frontend still links correctly.
3. Issue 3 (conditional selectors) — frontend only.
4. Issue 4 (spec table redesign) — frontend only, do last since it's purely cosmetic.

## Open questions to confirm before starting
- For Issue 2, is there an `is_default` flag on `product_variants`, or should "lowest id" be the tiebreaker for the representative variant? Yes
- For Issue 3, when there's exactly one color/size, should it be hidden entirely or shown as static (non-clickable) text? It could be shown as non-clikable static
