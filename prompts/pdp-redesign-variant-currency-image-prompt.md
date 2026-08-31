# Product Detail Page — Redesign, Variant Architecture, Currency, Image Bug

Four related pieces, in dependency order — do them in this order, not in
parallel, since B feeds directly into A's option selectors.

Files involved:
- `src/components/storefront/ProductDetail.tsx` (exists, generic 2-column
  layout — needs restructuring to match reference design)
- Whatever route currently serves single-product data to the PDP (locate
  it; if it only returns one variant's shape rather than a product +
  sibling variants, that's the gap in Part B)
- Image upload/storage code (locate `ImageUploadInput` and wherever it
  POSTs — needed for Part D)

## Part A — Layout to match reference design

Restructure `ProductDetail.tsx`'s right-column info section into
collapsible accordion groups, matching the reference screenshots:
- Title + wishlist icon top-right (already exists, keep)
- Price (see Part C for currency)
- Quantity selector (exists, keep)
- Full-width primary "ADD TO CART" button (dark/theme-primary, already
  close — just make full-width per reference, not currently constrained
  that way)
- **Product Details** — collapsible section, key/value rows (see Part B
  for what populates this)
- **Product Description** — collapsible section, existing
  `product.description` field, just move it into this accordion
- **Delivery / Shipping Information** — collapsible section. Source this
  from the same `ecom_settings` fields already used in the storefront
  footer (`terms_and_conditions`, `return_refund_policy`) — reuse
  whatever's already fetched for the footer rather than adding a new
  fetch, if that data is available at the layout/context level from the
  theme-provider pass.
- Low-stock messaging ("Only 1 unit left") — **optional, do this only if
  cheap**: `product_variants.low_stock_threshold` already exists in the
  schema; if the variant-detail endpoint from Part B is already returning
  qty, show this when `qty <= low_stock_threshold`. Skip it without
  asking if it adds real complexity — flag instead.
- Pincode/delivery-check input from the reference image — **out of scope
  for this pass**, don't build it. It needs real courier/serviceability
  integration. Leave it out entirely rather than a fake non-functional
  input.
- Gallery: main image + thumbnail row below (reference image 2) — current
  thumbnail-row implementation is already close; just confirm it matches
  (arrows on main image for prev/next are a nice-to-have, not required).

## Part B — Variant/option data architecture (do this before A can be fully wired)

**Decision, not a question — this is how it should work:** don't add a
"business config" for whether a product needs color/size selectors.
Derive it automatically per-product from the real `product_variants` rows
that share a `product_id`. A saree with one variant (one color, no size
variation) shows no selectors at all — just Add to Cart. A kurta with
multiple colors and sizes shows both. This requires no new config table,
only correct data assembly.

### B1. New/updated detail endpoint

Locate or create a public endpoint, e.g.
`/api/tenant/[company]/products/[variantId]/detail`, using the same
tenant-resolution pattern as the existing products-list route
(`public.companies.subdomain_url`). Given a `variantId`, it should:
- Look up that variant's `product_id`.
- Fetch **all variants** sharing that `product_id` (not just the one
  clicked), each with its own `variantId`, `color`, `size`, `sku`,
  effective price (same override→pricing fallback logic as the list
  route), stock (`ecom_available_stock`), and images.
- Fetch product-level fields once: `name`, `description`, `material`,
  `weight`, `length`/`width`/`height`, category.
- Return both: product-level info + the sibling variants array.

### B2. Derive selectable options client-side (or server-side, either is fine)

From the sibling variants array, compute distinct `color` values and
distinct `size` values present. Only render a selector for a dimension if
more than one distinct value exists across the siblings. When the
customer picks a combination, resolve it to the matching sibling
variant's `variantId`/price/stock/images and swap the displayed data and
the id that gets added to cart — don't let "Add to Cart" add the
originally-loaded variant if the customer changed the selection.

### B3. "Product Details" table — flag this choice, don't just pick one

Your reference shows category-specific attributes (Color, Zari, Border
Style, Blouse Style, Weight) that won't be the same for a kurta or a
non-apparel product. Check first whether an existing flexible
attributes/specifications mechanism already exists anywhere in the
Inventory/Product Catalog module (custom fields, EAV table, etc.) — if
so, reuse it. If nothing exists, the two options are:
- **(a)** A generic `specifications: {label, value}[]` jsonb field on the
  product, populated per-product by the tenant in the product-creation
  form, rendered as-is in this accordion — flexible across any category,
  no schema change needed later.
- **(b)** Stick to the fixed columns already on `products`
  (material/weight/dimensions) plus variant fields (color/size/gender) —
  simpler, but won't cover attributes like "Zari" or "Border Style" that
  don't exist as columns today.
Default to **(a)** if nothing existing is found — it matches what the
reference image actually needs — but confirm with me before adding a new
jsonb field/migration rather than assuming silently.

## Part C — Currency: ₹ not $

Price should display as `₹4,765` style (₹ symbol, Indian digit grouping
where practical), not `$`. For this pass, hardcode the ₹ symbol in the
price display rather than building a full multi-currency system — but
don't scatter raw `$`/`₹` strings across multiple components; put the
formatting in one small utility (e.g. `formatPrice(amount: number):
string`) used everywhere a price renders (PDP, ProductGrid, Cart) so
switching currency later is a one-file change, not a find-and-replace.
Flag to me separately if/when you want real multi-currency (stored per
tenant) — not in scope here.

## Part D — Product images not showing on Vercel deployment

Diagnose before fixing — most likely cause given "blob code is added but
images still don't show": images are being saved to a local `/uploads/`
path on the filesystem, which works in local dev but **does not persist**
on Vercel's serverless/ephemeral filesystem — every deploy or cold start
wipes it. If Vercel Blob storage integration exists but isn't actually
being used for the write path (still writing to local disk, or writing to
Blob but storing the wrong URL shape in `product_images.image_url`),
that's the bug.

Check, in order:
1. Does `ImageUploadInput`'s upload handler actually call Vercel Blob's
   `put()` (from `@vercel/blob`) and get back a public blob URL, or does
   it write to a local path and construct a relative `/uploads/...` URL
   like the normalization logic seen in the products POST route?
2. Is `BLOB_READ_WRITE_TOKEN` actually set in the Vercel project's
   environment variables (not just `.env.local`)?
3. Is the URL saved into `product_images.image_url` the actual public
   Blob URL (`https://*.public.blob.vercel-storage.com/...`), or still a
   relative `/uploads/...` path that only resolves locally?
4. If images render via `next/image` anywhere, confirm the Blob storage
   hostname is added to `next.config.js` `images.remotePatterns` — if
   using plain `<img>` tags, this isn't needed.

Fix whichever of these is actually wrong — don't apply all four blindly.

## When done, tell me

- Which option you took for B3 (existing mechanism reused, or (a)/(b)),
  and if (a), the new field/migration you added.
- Confirm Add to Cart uses the resolved sibling variant's id after a
  selection change, not the originally-loaded one.
- The actual root cause found in Part D and which fix applied.
- Whether low-stock messaging (A) was included or skipped, and why.
