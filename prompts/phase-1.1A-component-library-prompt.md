# Phase 1.1A — Component Library Extraction (Prompt)


# Phase 1.1A — Storefront Shell & Navigation Extraction

Existing store link: `src\app\[company]\(store)\store`
Template source: `src/components/sampletemplate`
Target destination: `src/components/storefront/`

Extract the foundational shell and navigation components from the template into modular, reusable React components. Do not hardcode tenant values.


 **Required components:**
 - Header/Nav (logo, category menu, search, cart icon, sign-in entry point)
 - Hero/Banner (image + CTA, tenant-editable)
 - Category grid / category landing
 - Product grid with filters (category, price range, in-stock)
 - Product detail page (images, variants, price, stock, add to cart, wishlist)
 - Cart drawer/page
 - Checkout flow shell (address → payment method → review → place order) —
   step scaffolding only in this phase, wiring comes in 1.3
 - Wishlist page
 - Sign-in / OTP verification page (customer identity — separate from
   tenant-user auth, see `customer_ecom_auth`)
 - Footer (T&C, return/refund policy, support contact — sourced from
   `ecom_settings.terms_and_conditions` / `return_refund_policy` /
   `support_email` / `support_phone`)

 **Theming contract — every component takes a single `theme` prop, no
 hardcoded tenant values anywhere in component code:**
 ```ts
 type StorefrontTheme = {
   primaryColor: string;
   secondaryColor: string;
   logoUrl: string;
   bannerImages: string[];
   fontFamily: string;
   layoutVariant?: string;
   heroTitle?: string;
   heroDescription?: string;
   socialLinks?: { facebook?: string; instagram?: string; whatsapp?: string };
 };
 ```
 This shape is what lives inside `storefront_config.draft_theme` /
 `published_theme` (JSONB) — don't invent a different shape or a different
 table. When previewing draft state, components render from `draft_theme`;
 when live, from `published_theme`. Same components, different data source —
 never fork the component for "preview mode."

 **Product data contract** — components consume a normalized product shape
 assembled server-side by joining `storefront_products` → `product_variants`
 (→ `product_pricing` / `ecom_price_overrides` for price, see below). Do not
 let components query the database directly.
 ```ts
 type StorefrontProduct = {
   variantId: number;
   name: string;
   images: string[];
   effectivePrice: number;     // ecom_price_overrides.ecom_price if active, else product_pricing.final_selling_price
   compareAtPrice?: number;
   inStock: boolean;           // from ecom_available_stock.available_qty  0
   sortOrder: number;
 };
 ```

 **Stock display rule (explicit, not a filter):** the product grid shows
 ALL variants where `storefront_products.is_selected_draft = true` (editor
 preview) or `is_live = true` (live site) — do not hide out-of-stock items
 from the grid. Instead render an "Out of stock" badge when
 `ecom_available_stock.available_qty <= 0` for that variant, and disable
 (not hide) the add-to-cart button on the product detail page in that case.
 This matches the Phase 0 decision that stock is checked at cart/checkout,
 not at listing eligibility — flag it to me if you'd rather hide them
 instead, but badge-and-disable is the default here.

 **Do not build yet in this phase:** live database wiring, the editor UI
 (1.2), or the public routing/OTP/checkout logic (1.3). This phase is
 components + Storybook-style fixture data only, so the library can be
 reviewed in isolation before it's wired to real drafts.

 When done, give me a short list of every component created, its prop
 signature, and any template markup you deliberately left out or simplified.
