## Phase 1 — Storefront Template & Editor

### 1.1 Component Library (build once, not per tenant)
**Prompt:**
> Using [attach your sample template here], extract a reusable, theme-driven component library — do not generate a full site in one shot. Required components:
> - Header/Nav (logo, category menu, search, cart icon, sign-in)
> - Hero/Banner (image + CTA, tenant-editable)
> - Category grid / category landing
> - Product grid with filters (category, price range, in-stock)
> - Product detail page (images, variants, price, stock, add to cart, wishlist)
> - Cart drawer/page
> - Checkout flow (address → payment method → review → place order)
> - Wishlist page
> - Sign-in / OTP verification page (customer identity — separate from tenant-user auth)
> - Footer (T&C, return policy, contact — pulled from Store Settings 0.1)
>
> Each component must accept a `theme_config` object: `{ primaryColor, logoUrl, bannerImages[], fontFamily, layoutVariant }`. No hardcoded tenant-specific values anywhere in the component code.

### 1.2 Storefront Editor UI (for Tenant User)
**Prompt:**
> Build the editor screen inside the tenant workspace where the Tenant User:
> 1. Sets theme config (logo, banner, colors) — saved to `storefront_config.draft_json`.
> 2. Browses their product variants (auto-filtered to active + priced + in-stock only, per section 0.2) and toggles `is_selected_for_ecom` per variant.
> 3. Sees a live preview of the draft storefront (render components from 1.1 using draft data).
> 4. Hits "Publish" — this button is disabled with a tooltip ("Complete Store Settings first") until `store_settings_status = complete` (0.1).
> 5. On Publish: copy `draft_json` → `published_json`, copy selected products' `is_selected_for_ecom` → `is_live_on_ecom`, bump `version`, timestamp `published_at`.
>
> Note: T&C/payment/region setup (0.1) happens once and is never re-prompted during subsequent publishes — only the theme/product selection is re-editable each time.

### 1.3 Customer-Facing Storefront Runtime
**Prompt:**
> Build the public-facing storefront that renders `published_json` + `is_live_on_ecom` products for a given tenant, resolved via the subdomain (0.3). Includes:
> - Home page, category browse, filters, product page, wishlist, cart — using components from 1.1
> - Customer sign-in via OTP (mobile number), session tied to `tenant_id + customer_id`
> - Checkout: collect address → select payment mode (only options tenant enabled in 0.1) → create inventory reservation (0.2) → payment gateway redirect (if prepaid) or COD confirmation
> - On successful order: create order record (Phase 2 schema), release/convert reservation, trigger confirmation notification (SMS/email/WhatsApp)
