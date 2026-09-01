# Prompt: Add Quick View to ProductGrid, Replace Persistent Add-to-Cart

## Context
File to edit: the product grid card component (`ProductGrid.tsx`), which currently renders,
per card: image, stock/sale badge, an always-visible wishlist heart (top-right of image), product
name, price, and a full-width, always-visible "Add to Cart" button.

## Goal
Replace the always-visible "Add to Cart" button with a **Quick View** flow, without changing the
existing "click product → go to detail page" navigation.

---

## 1. Card changes (`ProductGrid.tsx`)

- **Remove** the permanent `<button>Add to Cart</button>` block under the price.
- **Keep** the wishlist heart exactly where it is today (top-right of image), **always visible on
  both desktop and mobile** — no change to its current visibility behavior, only styling stays
  consistent with the new icon added next to/near it.
- **Add** a Quick View **eye icon**, overlaid on the product image:
  - **Desktop:** hidden by default, revealed **only on hover**, via CSS
    (`opacity-0 group-hover:opacity-100`), not React state — hovering one card must never
    re-render the rest of the grid.
  - **Mobile / touch devices:** **always visible** (use a `@media (hover: none)` rule to force
    full opacity), since there is no hover state to reveal it.
- Card footer keeps: product name (click → `onProductClick`, unchanged), price + compare-at price
  (unchanged). No button remains permanently in the footer.
- Stock/Sale badge logic on the image is unchanged.

## 2. New `QuickViewModal.tsx` component

Create a new file, e.g. `QuickViewModal.tsx`, colocated with `ProductGrid.tsx`.

**Props:**
```ts
interface QuickViewModalProps {
  theme: StorefrontTheme;
  product: StorefrontProduct | null; // null = closed
  onClose: () => void;
  onAddToCart: (product: StorefrontProduct, quantity: number) => void;
  onViewDetails: (product: StorefrontProduct) => void; // same handler as onProductClick
}
```

**Image area:**
- If the product has more than one image, render them as a **scrollable gallery within the
  modal itself** (vertical  scroll container, per the reference design) — not a
  single static image. Default scroll position lands on the *second* image (`images[1]`) where
  available; the user can scroll to see the rest, including the first.
- If there's only one image, just show it (no scroll affordance needed).
- Use native scroll (`overflow-y: auto` / `overflow-x: auto` with `scroll-snap`) rather than a
  JS-driven carousel library, to keep this lightweight and avoid jank.

**Color variant swatches (navigate away, don't switch in-place):**
- If the product has more than one color variant, show small circular color swatches at the
  top of the image area inside the modal.
- Clicking a swatch does **not** try to swap images/price/stock in place inside the quick view
  (that needs full variant data — price, stock, images per color — which the lightweight grid
  listing doesn't carry). Instead, clicking a swatch calls `onViewDetails` with that variant,
  navigating to the full product detail page — same pattern as clicking the product name.
- If the product has only one color, don't render the swatch row at all.

**Size selector (select in-place, no navigation):**
- Unlike color, size doesn't change the image set, so it's handled *inside* the modal rather
  than navigating away.
- If the product has more than one size **within the currently selected color**, render a size
  selector (pills, e.g. S / M / L) below the price.
- Selecting a size updates local modal state — `selectedVariantId`, `selectedPrice`,
  `selectedCompareAtPrice`, `selectedInStock` — sourced from that size's entry in
  `sizeVariants` (see data requirement below). No page navigation, no refetch.
- Sizes that are out of stock render greyed out and non-clickable (not hidden — the user should
  still see the size exists but can't currently buy it).
- If there's only one size, auto-select it silently and skip rendering the selector.(still show the size refer image )
- **Add to Cart is disabled until a valid, in-stock size is resolved** — either auto-selected
  (single size) or explicitly picked by the user (multiple sizes). `onAddToCart` is called with
  `selectedVariantId`, not the grid's original representative `variantId`, whenever a size
  selection has occurred.

**Rest of content (unchanged from prior spec):**
- Product name (plain text, not clickable here — click-through lives on "...more" and the color
  swatches).
- Price row: `effectivePrice`, with `compareAtPrice` struck through when present — reuse the
  existing `formatPrice` logic from the grid, don't reimplement.
- Description: truncate to ~150 characters with an ellipsis, followed by an inline **"...more"**
  link/button. Clicking name-on-card, "...more", or a color swatch all call
  `onViewDetails(product)` → the same full detail page navigation the grid already does today.
- Quantity stepper: local `useState` inside the modal (`-` / number / `+`), starting at 1, reset
  to 1 whenever a different product opens.
- **Add to Cart** button: full-width, primary color from `theme`, calls
  `onAddToCart({ ...product, variantId: selectedVariantId, effectivePrice: selectedPrice }, quantity)`
  so the correct sized variant is what actually gets added — disabled whenever no valid in-stock
  size is resolved yet, or when the resolved size is out of stock (mirror today's disabled
  styling).
- Close button (X, top-right) and click-outside-to-close.

## 3. Data requirements for swatches and size selection

- `StorefrontProduct` (or whatever type the grid consumes) needs two new **optional, lightweight**
  fields, e.g.:
  ```ts
  colorVariants?: { variantId: number; color: string; swatchImage?: string }[];
  sizeVariants?: {
    variantId: number;
    size: string;
    effectivePrice: number;
    compareAtPrice?: number;
    availableQty: number;
    inStock: boolean;
  }[];
  ```
- `colorVariants` = every distinct color the product comes in, just `variantId` + `color` (+ a
  small swatch thumbnail if cheap to include) — used only for navigation, never for in-modal
  switching.
- `sizeVariants` = every sibling variant **sharing the same color as the grid's representative
  variant**, with enough data (`effectivePrice`, `availableQty`/`inStock`) to select in place
  without a refetch. This is still much lighter than the full product-detail payload (no images,
  no description duplication).
- Both fields are populated by the listing API. Neither should carry full variant detail
  (images, description) — that stays the job of the existing product-detail endpoint.
- If `colorVariants` is absent or has ≤1 entry, the swatch row doesn't render. If `sizeVariants`
  is absent or has ≤1 entry, the size selector doesn't render and that single variant is used
  directly — no crash, no placeholder either way.

## 4. Wiring it up in `ProductGrid.tsx`

- Add local state: `const [quickViewProduct, setQuickViewProduct] = useState<StorefrontProduct | null>(null)`.
- Eye icon `onClick` → `setQuickViewProduct(product)`.
- Render `<QuickViewModal product={quickViewProduct} onClose={() => setQuickViewProduct(null)} onAddToCart={onAddToCart} onViewDetails={onProductClick} theme={theme} />` once, outside the card-mapping loop (not per-card) — a single modal instance reused for whichever product is active, not one per grid item.

## 5. Performance / cleanliness requirements

- **Don't mount the modal's DOM when closed.** Return `null` early inside `QuickViewModal` when
  `product` is `null`, rather than rendering-and-hiding with CSS — keeps the grid's initial paint
  light.
- **Portal the modal** to `document.body` (e.g. via `createPortal`) so it isn't affected by the
  grid's `overflow`/`transform` ancestors and doesn't force layout recalculation on the whole
  grid tree.
- **Hover reveal via CSS only** (`group` + `group-hover:opacity-100`), not `onMouseEnter`/
  `onMouseLeave` state — avoids re-rendering all grid cards on every hover.
- Image gallery inside the modal uses native scroll, not a JS animation loop.
- If this app is Next.js, consider `next/dynamic(() => import('./QuickViewModal'), { ssr: false })`
  so the modal's JS isn't in the initial grid bundle.
- Keep `QuickViewModal` a **presentational** component — it receives `product` and callbacks as
  props, no data fetching inside it. It should not re-fetch product data; everything it needs is
  already on the `StorefrontProduct` object passed from the grid.
- Memoize the card sub-component (`React.memo`) if it isn't already, so opening the modal for one
  product doesn't re-render every other card in the grid.

## 6. Explicit non-changes (to avoid scope creep)

- Clicking the product image or product name still calls `onProductClick` exactly as today —
  no change to that navigation.
- Wishlist toggle behavior/handler (`onToggleWishlist`) is unchanged, only its always-visible
  presentation is preserved/reused for the new icon pairing.
- No changes to the filtering/sorting/search logic already in `ProductGrid.tsx`.
- No changes to the full product detail page — Quick View is purely a grid-level addition, and
  color-swatch clicks in the modal simply deep-link there rather than reimplementing variant
  switching inline.

## Acceptance criteria
- Grid cards show no persistent "Add to Cart" button.
- Wishlist heart is visible at all times, on both desktop and mobile.
- Quick View (eye) icon is hover-only on desktop, and always visible on mobile/touch.
- Clicking the eye icon opens a modal with: a scrollable image gallery (starting near the second
  image when multiple exist), color swatches at the top of the gallery when the product has more
  than one color, price, a size selector when the product has more than one size, truncated
  description with "...more", a quantity stepper, and an Add to Cart button.
- Clicking "...more", a color swatch, or the product name on the card all navigate to the same
  full detail page as before — no duplicated or diverging navigation logic.
- Selecting a size updates price/stock/Add-to-Cart target in place, with no navigation and no
  network request.
- Add to Cart is disabled until a valid in-stock size is resolved (auto-resolved when there's
  only one size), and always adds the specifically selected variant — never the grid's original
  representative variant when a different size has been chosen.
- Opening/closing Quick View, and scrolling the image gallery, cause no visible jank and do not
  re-render unrelated grid cards.