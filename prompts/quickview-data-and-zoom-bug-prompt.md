# Prompt: Fix Quick View data source, and diagnose lightbox zoom rendering bug

## Part 1 — Quick View shows fallback data instead of real product data

### Symptom
In `QuickViewModal.tsx`:
- Description always shows the hardcoded fallback text, never `product.description`.
- Size selector always shows a single "Standard" pill, never real sizes.
- Color swatches row never appears, even for products with multiple colors.
- Only one image is visible in the gallery — nothing to scroll.

### Root cause
`QuickViewModal` receives whatever product object `ProductGrid` passes it, and that object
comes from `/api/tenant/[company]/products/route.ts` (the listing API), which today only
returns `id`, `products.name`, `product_pricing.price`, and a single `product_images[0]` per
row. It has no `description`, no sibling `variants`, and no `colorVariants`/`sizeVariants` —
so every one of `QuickViewModal`'s fallback branches (`product.description || "..."`, the
`sizeOption` fallback, `colorVariants.length > 1` check) is firing because the real fields are
simply `undefined`.

### Fix — fetch full detail on open, don't bloat the listing payload
Rather than adding `description`/`colorVariants`/`sizeVariants`/full images to the listing API
(which would inflate the payload for every product on the grid, most of which never get a
Quick View click), have the modal **fetch the existing detail endpoint on demand**:

- `/api/tenant/[company]/products/[variantId]/detail` already returns exactly what's needed:
  `product.description`, `variants[]` (each with `color`, `size`, `effectivePrice`,
  `compareAtPrice`, `availableQty`, `inStock`, `images[]` filtered to that variant, falling back
  to all product images).
- In `QuickViewModal`, when `product` (the grid's lightweight object) becomes non-null:
  1. Immediately open the modal shell with a loading skeleton (image placeholder, text-line
     skeletons) using whatever minimal data the grid object already has (name, price) so the
     modal doesn't feel like it's stalled.
  2. Fire `GET /api/tenant/{company}/products/{product.variantId}/detail` in a `useEffect`.
  3. On response, populate: `description` from `data.product.description`; `sizeVariants` by
     filtering `data.variants` to those sharing the same `color` as the opened variant (mirrors
     the size-selector logic already speced); `colorVariants` as the unique `{variantId, color}`
     pairs across `data.variants`; `images` from the matching variant's `images[]` (falling back
     to the first variant's images if the opened `variantId` isn't found, matching the detail
     route's own fallback behavior).
  4. Keep a request-cancellation guard (e.g. an `AbortController`, or a `requestId` ref compared
     on resolve) so that rapidly opening Quick View on different products in succession can't let
     a slow, stale response overwrite a newer one.
  5. On fetch failure, keep showing the grid's lightweight data (name, price, single image) and
     hide the size/color rows and truncated-description-with-"...more" rather than showing an
     error state that blocks Add to Cart — a degraded Quick View is better than a broken one.
- Remove the placeholder-guessing fallbacks in `sizeVariants`'s `useMemo` (the `product.variants`
  and `product.options` branches) once the modal reliably gets real `variants` data from its own
  fetch — keep only the "no sizes → single Standard-less direct add" path for truly single-variant
  products where the detail response has ≤1 variant.
- `company` (tenant slug) needs to be available to the modal — pass it down as a prop from
  wherever `ProductGrid` already has it, rather than re-deriving it from the URL inside the modal.

### Image gallery
The vertical scrollable gallery structure already in `QuickViewModal` (stacked images,
`overflow-y-auto`, `snap-y`) is correct and doesn't need restructuring — it was only ever
starved of data (a 1-image array). Once the detail fetch supplies the real per-variant `images[]`,
scrolling will work as intended. One cosmetic call to make: images currently render with
`object-cover` inside a fixed `aspect-square` box, which crops. If product photos (like saree
borders/pallu detail) are getting cut off at the edges, switch to `object-contain` on a
neutral background instead — confirm with a few real products before deciding.

### Acceptance criteria
- Opening Quick View on a product with a real description shows that description (truncated at
  ~140 chars with "...more"), not the fallback text.
- Opening Quick View on a product with multiple sizes shows the actual size list, not "Standard".
- Opening Quick View on a product with multiple colors shows the color swatch row.
- Opening Quick View on a product with 2+ images lets the user scroll through all of them.
- Switching between products quickly (open A, close, open B) never shows A's data inside B's
  modal.

---

## Part 2 — Fullscreen lightbox: vertical stripe rendering artifact

### Symptom
In the fullscreen zoom lightbox (`ProductDetail.tsx`), the area to the right of the main zoomed
image renders as a dark panel filled with many thin, evenly-spaced vertical lines instead of a
clean thumbnail rail (see attached screenshot).

### Hypothesis (unconfirmed — verify before fixing)
The desktop thumbnail strip is rendering far more `<img>` elements than the current variant
actually has, and they're collapsing to slivers instead of the intended fixed 80×64px boxes.
Given your `product_images` sample data has multiple rows per `product_id` split across several
different `variant_id`s, a likely cause is that `activeVariant.images` (or the `product.images`
fallback it uses) is not actually scoped to just the active variant — e.g. it's picking up
`allImages` (every image for the product, across every color) instead of the
per-variant-filtered set the detail API is supposed to return.

### Verification steps (do these first, before changing code)
1. Open the lightbox on a product with multiple color variants and log
   `images.length` and `images` itself (the array `ProductDetail` computes at
   `const images = activeVariant?.images && ... : product.images`).
2. Compare that count against how many images the detail API actually returned for that specific
   `variant_id` in the network tab response (`variants[].images`).
3. If the count matches what you'd expect for one variant (e.g. 2), the bug is CSS layout, not
   data — inspect the thumbnail `<button>` elements in devtools and check their *computed* width/
   height; if they're rendering far narrower than `w-16`/`h-20`, something is overriding the
   Tailwind classes (check for a CSS specificity conflict, a missing Tailwind build/purge entry,
   or a parent `flex-row` accidentally winning over `flex-col`).
4. If the count is much higher than expected (e.g. 8+ for a product with 3 colors), the bug is
   upstream in the data: trace whether `activeVariant.images` is really scoped per-variant, or
   whether it's silently falling through to a merged/all-variant image list somewhere between the
   detail API response and what gets passed into `ProductDetail`.

### Fix (apply whichever branch verification confirms)
- **If it's a data-scoping bug:** ensure the thumbnail rail only ever receives the current
  `activeVariant`'s own images, never the full cross-variant set, matching how the detail API's
  `imagesRes` is already supposed to filter by `variant_id` with an `allImages` fallback only when
  a variant has zero images of its own.
- **If it's a CSS/layout bug:** make the thumbnail sizing defensive regardless of how many items
  are in the list — explicit `min-h-[80px] min-w-[64px]` in addition to `h-20 w-16`, and confirm
  `flex-shrink-0` is actually taking effect (no conflicting utility later in the class string
  overriding it). The list should scroll (`overflow-y-auto`, already present) rather than ever
  visually compress items to fit.

### Acceptance criteria
- The thumbnail rail in the lightbox shows one clearly-sized thumbnail per image belonging to the
  currently selected variant only — no stripe/sliver artifacts, regardless of how many total
  images the product has across all its colors.
