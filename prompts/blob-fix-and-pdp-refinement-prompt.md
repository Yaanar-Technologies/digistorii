# Fix Blob Image URL Bug + PDP Specification & Returns Section

## Part A — Fix broken image URLs on Vercel (root cause confirmed)

File: wherever `normalizeImageInput` lives (seen inside the products POST
route). It currently does:

```ts
const normalizeImageInput = (value: string) => {
  let path = String(value || "").trim();
  if (!path) return { filePath: "", imageUrl: "" };
  const uploadsIndex = path.toLowerCase().indexOf("/uploads/");
  if (uploadsIndex !== -1) {
    path = path.slice(uploadsIndex + "/uploads/".length);
  } else if (path.toLowerCase().startsWith("uploads/")) {
    path = path.slice("uploads/".length);
  } else if (path.startsWith("/")) {
    path = path.slice(1);
  }
  path = path.replace(/^\/+/, "");
  return { filePath: path, imageUrl: `/uploads/${path}` };
};
```

This unconditionally prefixes every image path with `/uploads/`, even
when the incoming value is already a full Vercel Blob URL (e.g.
`https://*.public.blob.vercel-storage.com/...`) returned by the upload
route. That mangles it into `/uploads/https://...`, which is why images
upload fine (the image-master upload route itself is correct — confirmed
working) but never render.

Fix: detect an absolute URL and pass it through unchanged, only apply the
local-relative-path logic otherwise:

```ts
const normalizeImageInput = (value: string) => {
  let path = String(value || "").trim();
  if (!path) return { filePath: "", imageUrl: "" };

  // Already an absolute URL (Vercel Blob, or any external URL) — use as-is
  if (/^https?:\/\//i.test(path)) {
    return { filePath: path, imageUrl: path };
  }

  const uploadsIndex = path.toLowerCase().indexOf("/uploads/");
  if (uploadsIndex !== -1) {
    path = path.slice(uploadsIndex + "/uploads/".length);
  } else if (path.toLowerCase().startsWith("uploads/")) {
    path = path.slice("uploads/".length);
  } else if (path.startsWith("/")) {
    path = path.slice(1);
  }
  path = path.replace(/^\/+/, "");
  return { filePath: path, imageUrl: `/uploads/${path}` };
};
```

Check whether this same normalization pattern (unconditional `/uploads/`
prefixing) is duplicated anywhere else in the codebase (e.g. variant
image handling, logo/banner handling in the theme editor's
`ImageUploadInput` flow) and apply the same fix there — don't just patch
this one call site if the bug is copy-pasted elsewhere.

Confirm the dual local/Blob upload path (already correctly implemented in
the upload route via the `isVercel` check) stays intact — this fix is
purely about how the resulting URL gets stored/used downstream, not about
changing where files are uploaded.

## Part B — Product Details: correct fields + a distinct visual design

### B1. Fields — full replacement, not a plain data swap

Remove all current category-specific placeholder fields not all only few( Body Design, Washcare, Fabric, Zari, Border Style, Blouse Style).
Show only these, each independently, only when present:

- **Material** — `product.material`, show only if non-empty string
- **Fitting** — variant/product fitting field, show only if non-empty
- **Gender** — `variant.gender`, show only if non-empty
- **Length**, **Weight**, **Height**, **Width** — each shown individually
  only if the value is a number greater than 0. Treat both `null`/
  `undefined` **and** `0` as "not applicable" and hide the field — don't
  render a zero value - dont display the headers also

If the detail endpoint from the earlier PDP prompt doesn't already return
`material`/`fitting`/`gender`/dimensions, add them to that response.

### B2. UI — don't reuse the plain label/value grid

Both reference designs use a flat, repeating 2–3 column table of
label-over-value pairs with no visual hierarchy — don't copy that.
Build something distinct instead: **icon-led spec cards**.

- Each present attribute renders as a small rounded card, not a table
  row: a compact icon top-left (simple line icon per attribute type —
  e.g. a tag/swatch icon for Material, a ruler for
  Length/Height/Width, a scale icon for Weight, a person/figure icon for
  Gender, a shirt/fit icon for Fitting), a small muted uppercase label
  beneath the icon, and the value in medium-bold text below that.
- Arrange as a responsive auto-fill grid (`grid-template-columns:
  repeat(auto-fill, minmax(140px, 1fr))` or equivalent) so it reflows
  naturally from 2 columns on mobile to 4+ on desktop, rather than a
  fixed 3-column table.
- Tie it to the tenant's brand instead of looking generic: a thin left
  accent border or icon color using `theme.secondaryColor`, subtle
  background tint (very light, derived from `theme.primaryColor` at low
  opacity) on hover — small enough to feel intentional, not loud.
- Keep it inside the same collapsible "Product Details" accordion
  section as before — only the internal layout changes, not where it
  lives on the page.
- Use simple inline SVGs for the icons (small, single-color, stroke-based
  — matching the style already used for the wishlist heart icon
  elsewhere in `ProductDetail.tsx`) rather than pulling in an icon
  library, to keep this self-contained.

## Part C — Replace "Delivery" section with "Returns", sourced from `ecom_settings`

Remove the current delivery-instructions content. Add a **Returns**
accordion section instead, sourced from:
```sql
"${schema}".ecom_settings.return_refund_policy
"${schema}".ecom_settings.delivery_note
```
Both fields are **tenant-level, not per-product** — fetch them once
(reuse whatever already fetches `ecom_settings` for the footer/theme
layer, don't add a per-product-page fetch for tenant-wide data) and pass
down alongside theme/footer settings. Show `delivery_note` and
`return_refund_policy` as two clearly labeled parts within the same
accordion section (or two small sections, whichever fits the existing
accordion pattern better) — same content for every product on this
tenant's storefront.

## When done, tell me

- Whether the `/uploads/` mangling bug existed in any other call site
  besides the one shown, and if so, where.
- Confirm `length`/`weight`/`height`/`width` are correctly hidden when
  zero, not just when null/undefined.
- Confirm `delivery_note`/`return_refund_policy` are fetched once at the
  tenant level and reused, not re-fetched per product.
- Confirm the Product Details section renders as icon-led cards, not a
  reused label/value table — send a screenshot if easy.