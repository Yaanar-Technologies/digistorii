# E-Commerce Module — Build Plan & Prompt Pack
### For: Multi-tenant POS Billing SaaS (adding Storefront + Orders)

---

## 0. Design Principles (apply to every phase)

- **Multi-tenant isolation first.** Every table, cache key, and API call must be scoped by `tenant_id`. No shared mutable state across tenants.
- **Draft vs Published.** Storefront config and product listings always have a draft state and a published (live) snapshot. Publishing = versioned copy, not in-place mutation.
- **Read/write separation.** Storefront (customer-facing) reads should not hit the same live transactional tables used by POS billing under load — use a cached/denormalized read model (materialized view, cache layer, or read replica) fed by product/pricing/inventory changes.
- **Reuse, don't regenerate.** Build one component library once; theme it per tenant with a JSON config, not a fresh template generation per tenant.

---

## Phase 0 — Foundation (build this before any storefront UI)

> Built against the actual `initializeDatabase` (public schema) and `createCompanySchema` (per-tenant schema) migrations already in the codebase. All new ecom-specific tables go inside `createCompanySchema` — same pattern as `sales_header`, `product_variants`, etc. Only domain routing touches the public `companies` table.

### 0.1 Domain Routing (public schema)
**Prompt:**
> Extend the `companies` table (routing fields only — do NOT add an `ecom_enabled` flag here, that would duplicate `company_subscriptions.ecommerce_access` which already exists and is plan-driven):
> ```sql
> ALTER TABLE companies
>   ADD COLUMN custom_domain VARCHAR(255) UNIQUE,
>   ADD COLUMN custom_domain_status VARCHAR(20) NOT NULL DEFAULT 'not_configured'
>     CHECK (custom_domain_status IN ('not_configured','pending_dns','verified','failed')),
>   ADD COLUMN custom_domain_verified_at TIMESTAMP;
> ```
> Every place that decides "can this tenant use ecom features" (Store Settings visibility, storefront routing, publish button) must check `company_subscriptions.ecommerce_access = true` for that company — this keeps INSTORE-plan tenants correctly locked out without a second flag to keep in sync.
> Build middleware that resolves an incoming request to a tenant in one lookup against `companies` (by path segment `digistorii/{subdomain_url}` OR by `custom_domain` if verified), returning `schema_name` + `company_id`. Cache this resolution (Redis, short TTL) since it will run on every storefront request. **Nothing past this middleware layer should ever see `subdomain_url` or `custom_domain` again** — pass `schema_name`/`company_id` down, not the domain string. This is what makes renaming a subdomain or swapping in a custom domain later a zero-risk operation: only this one lookup changes.
>
> Add a DNS verification flow: tenant enters `custom_domain` in Store Settings → status becomes `pending_dns` → show them the required CNAME record → poll/verify → flip to `verified`. Until verified, the platform subdomain keeps working as fallback.

### 0.2 Tenant Identifier Convention (fix going forward)
**Prompt:**
> For every new ecom table below: do not add a `tenant_id VARCHAR` column populated from `subdomain_url` (the pattern seen in some existing tables like `stock_ledger`). Since these tables live inside the tenant's own Postgres schema, the schema itself is the isolation boundary — no tenant_id column is needed at all in most cases. Where a table needs to reference the parent company explicitly (e.g. for a cross-schema reporting job), use `company_id INT` (immutable), never the domain string. Do not touch the existing `tenant_id VARCHAR` columns in older tables — that's separate cleanup, not a blocker here.

### 0.3 Ecom Store Settings (tenant schema, one-time setup, gates Publish)
**Prompt:**
> Inside `createCompanySchema`, add:
> ```sql
> CREATE TABLE IF NOT EXISTS "${schema}".ecom_settings (
>   id SERIAL PRIMARY KEY,
>   company_id INT NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
>   payment_mode VARCHAR(20) NOT NULL DEFAULT 'cod_only'
>     CHECK (payment_mode IN ('cod_only','prepaid_only','both')),
>   gateway_provider VARCHAR(30),
>   gateway_key_id TEXT,
>   gateway_key_secret_enc TEXT,
>   serviceable_countries TEXT[] NOT NULL DEFAULT ARRAY['India'],
>   serviceable_states TEXT[],
>   serviceable_pincodes TEXT[],
>   terms_and_conditions TEXT,
>   return_refund_policy TEXT,
>   delivery_note TEXT,
>   support_email VARCHAR(150),
>   support_phone VARCHAR(20),
>   use_custom_pricing BOOLEAN NOT NULL DEFAULT FALSE,
>   use_custom_discounts BOOLEAN NOT NULL DEFAULT FALSE,
>   setup_status VARCHAR(20) NOT NULL DEFAULT 'incomplete'
>     CHECK (setup_status IN ('incomplete','complete')),
>   created_at TIMESTAMP DEFAULT NOW(),
>   updated_at TIMESTAMP DEFAULT NOW()
> );
> ```
> `company_id` here is `companies.id` (never `subdomain_url`), with a real cross-schema FK — Postgres allows this within the same database. Build the one-time setup UI for Tenant User to fill this in. `setup_status` flips to `complete` once payment_mode + at least one serviceable region + T&C are filled. This is checked (not re-prompted) on every future Publish.
>
> `use_custom_pricing` / `use_custom_discounts` are simple toggles: OFF means ecom always mirrors POS pricing/discounts (default, zero extra setup for most tenants). ON reveals the per-variant override controls in the product-selection screen (0.4b). Only show these toggles at all if `company_subscriptions.ecommerce_access = true`.

### 0.4 Storefront Draft/Publish + Product Selection (tenant schema)
**Prompt:**
> ```sql
> CREATE TABLE IF NOT EXISTS "${schema}".storefront_config (
>   id SERIAL PRIMARY KEY,
>   company_id INT NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
>   draft_theme JSONB NOT NULL DEFAULT '{}'::jsonb,
>   published_theme JSONB,
>   version INT NOT NULL DEFAULT 0,
>   published_at TIMESTAMP,
>   published_by VARCHAR(100),
>   created_at TIMESTAMP DEFAULT NOW(),
>   updated_at TIMESTAMP DEFAULT NOW()
> );
>
> CREATE TABLE IF NOT EXISTS "${schema}".storefront_products (
>   id SERIAL PRIMARY KEY,
>   company_id INT NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
>   variant_id BIGINT NOT NULL REFERENCES "${schema}".product_variants(id) ON DELETE CASCADE,
>   is_selected_draft BOOLEAN NOT NULL DEFAULT FALSE,
>   is_live BOOLEAN NOT NULL DEFAULT FALSE,
>   sort_order INT DEFAULT 0,
>   created_at TIMESTAMP DEFAULT NOW(),
>   updated_at TIMESTAMP DEFAULT NOW(),
>   UNIQUE(variant_id)
> );
> ```
> The "select products" screen must only list variants where `product_variants.status = 'active'` — since status only becomes `active` once a `product_pricing` row exists (per your existing flow), that's already sufficient; no additional pricing check needed, and **no stock check at this stage** — stock only matters at cart/checkout time later, not for whether a variant is eligible to be listed on the storefront. On Publish: copy `draft_theme` → `published_theme`, copy `is_selected_draft` → `is_live` for all rows, bump `version`, stamp `published_at`/`published_by`. Publish button is disabled until `ecom_settings.setup_status = 'complete'` (0.3).

### 0.4b Ecom Pricing & Discount Overrides (tenant schema — additive only, no existing tables restructured)
**Prompt:**
> This is the starting-stage build: give Tenant User the ability to sell the *same* product on ecom at a different price, and/or apply ecom-only discounts, without touching how POS pricing/discounts work.
>
> ```sql
> CREATE TABLE IF NOT EXISTS "${schema}".ecom_price_overrides (
>   id SERIAL PRIMARY KEY,
>   company_id INT NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
>   variant_id BIGINT NOT NULL REFERENCES "${schema}".product_variants(id) ON DELETE CASCADE,
>   ecom_price NUMERIC(12,2) NOT NULL CHECK (ecom_price >= 0),
>   is_active BOOLEAN NOT NULL DEFAULT TRUE,
>   created_at TIMESTAMP DEFAULT NOW(),
>   updated_at TIMESTAMP DEFAULT NOW(),
>   UNIQUE(variant_id)
> );
>
> -- Additive column only — default preserves existing behavior for every current discount row
> ALTER TABLE "${schema}".discounts
>   ADD COLUMN channel VARCHAR(10) NOT NULL DEFAULT 'both'
>     CHECK (channel IN ('pos','ecom','both'));
> ```
>
> Resolution logic (used by the storefront product page and by the editor's price preview):
> - **Effective ecom price** for a variant = `ecom_price_overrides.ecom_price` where `is_active = true`, if a row exists; otherwise fall back to the active `product_pricing.final_selling_price` row (same one POS uses).
> - **Effective ecom discounts** for a variant = rows in `discounts` joined via `discount_variants` where `channel IN ('ecom','both')` and `is_active = true` and within `starts_at`/`ends_at`. POS-only discounts (`channel = 'pos'`) never apply on the storefront; discounts tagged `'both'` (the default — nothing existing changes) apply on both channels.
>
> On the product-selection screen (0.4), when `ecom_settings.use_custom_pricing = true`, show an editable "Ecom Price" field per selected variant (writes to `ecom_price_overrides`). When `use_custom_discounts = true`, show a simple toggle per applicable discount to mark it ecom-visible (writes `channel` on `discounts`). When both toggles are OFF, skip this UI entirely — ecom just mirrors POS as today.

### 0.5 Inventory Reservation (prevents POS/ecom overselling on shared stock)
**Prompt:**
> ```sql
> CREATE TABLE IF NOT EXISTS "${schema}".inventory_reservations (
>   id BIGSERIAL PRIMARY KEY,
>   variant_id BIGINT NOT NULL REFERENCES "${schema}".product_variants(id) ON DELETE CASCADE,
>   warehouse_id INT REFERENCES "${schema}".warehouses(id) ON DELETE RESTRICT,
>   qty_reserved NUMERIC(12,2) NOT NULL CHECK (qty_reserved > 0),
>   order_ref_id BIGINT,
>   status VARCHAR(20) NOT NULL DEFAULT 'held'
>     CHECK (status IN ('held','converted','released')),
>   expires_at TIMESTAMP NOT NULL,
>   created_at TIMESTAMP DEFAULT NOW()
> );
>
> CREATE INDEX IF NOT EXISTS idx_inventory_reservations_variant
>   ON "${schema}".inventory_reservations(variant_id) WHERE status = 'held';
>
> CREATE OR REPLACE VIEW "${schema}".ecom_available_stock AS
> SELECT
>   cs.warehouse_id, cs.locator_id, cs.product_id AS variant_id,
>   cs.current_stock - COALESCE(r.reserved_qty, 0) AS available_qty
> FROM "${schema}".current_stock cs
> LEFT JOIN (
>   SELECT variant_id, SUM(qty_reserved) AS reserved_qty
>   FROM "${schema}".inventory_reservations
>   WHERE status = 'held' AND expires_at > NOW()
>   GROUP BY variant_id
> ) r ON r.variant_id = cs.product_id
> WHERE cs.current_stock > 0;
> ```
> On checkout start: insert a `held` reservation with `expires_at = now() + 10 minutes`. On payment success (Phase 2): flip to `converted` and post a real `stock_ledger` entry (`txn_type = 'Sales'`, same mechanism POS billing already uses — reuse it, don't duplicate stock-deduction logic). On expiry: a scheduled job flips stale `held` rows to `released`. Product-page/storefront stock checks must read `ecom_available_stock`, never `current_stock` directly, or two customers can buy the last unit at once.

### 0.6 Ecom Customer Identity (companion to existing `customers` table)
**Prompt:**
> Your `customers` table already serves POS billing (walk-in customers on `sales_header`). Don't duplicate it — add a companion auth table, same pattern as `customer_addresses`:
> ```sql
> CREATE TABLE IF NOT EXISTS "${schema}".customer_ecom_auth (
>   id SERIAL PRIMARY KEY,
>   customer_id INT NOT NULL UNIQUE REFERENCES "${schema}".customers(id) ON DELETE CASCADE,
>   phone VARCHAR(20) NOT NULL UNIQUE,
>   otp_hash TEXT,
>   otp_expires_at TIMESTAMP,
>   otp_attempts INT NOT NULL DEFAULT 0,
>   is_verified BOOLEAN NOT NULL DEFAULT FALSE,
>   last_login TIMESTAMP,
>   created_at TIMESTAMP DEFAULT NOW()
> );
> ```
> On storefront sign-in: OTP by phone (reuse the same OTP hashing pattern as `onboarding_otps` in the public schema). If a phone number matches an existing `customers` row (e.g. same person bought in-store before), link to it instead of creating a duplicate customer.

---

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

---

## Phase 2 — Orders Module

### 2.1 Order Schema & Status Flow
**Prompt:**
> Build an `ecom_orders` table linked to `tenant_id`, `customer_id`, order line items (variant, qty, price at time of order), payment mode, payment status, and delivery address. Status flow:
> `Placed → Confirmed → Packed → Out for Delivery → Delivered`
> with branch states `Cancelled` (from Placed/Confirmed) and `Return Requested → Return Approved → Refunded` (from Delivered).
> Each ecom order on confirmation should also generate an invoice/ledger entry using the same invoicing logic as POS billing, so revenue reporting stays unified across channels.

### 2.2 Tenant Order Management UI
**Prompt:**
> Build an Orders screen for Tenant User (parallel to their existing billing screen) showing: order list, filters by status, order detail (bill-style view of line items, customer, payment status), and manual status transition buttons (Confirm, Pack, Mark Out for Delivery, Mark Delivered, Cancel).

### 2.3 Delivery Partner Integration (abstracted)
**Prompt:**
> Build a `DeliveryProvider` interface, not a hardcoded single-vendor integration:
> - `createShipment(order)` → returns `delivery_id`/tracking id
> - `getStatus(delivery_id)` → normalized status
> - Webhook receiver endpoint per provider that maps provider-specific status → your internal order status enum, and updates `ecom_orders.status` automatically.
> - v1 can implement one concrete provider (e.g. Shiprocket/Delhivery) plus a "Manual" provider where the tenant enters a delivery ID and updates status manually. Design the interface so a second real provider can be added later without touching order logic.

### 2.4 Reconciliation (COD-specific)
**Prompt:**
> Build a reconciliation view for Tenant User: COD orders marked Delivered but not yet marked "Cash Collected", so tenants can track outstanding COD cash against delivery partner remittance.

---

## Suggested Build Order (summary)

| Order | Item | Why |
|---|---|---|
| 1 | 0.1 Store Settings | Gates everything downstream |
| 2 | 0.2 Data model (draft/publish + inventory reservation) | Prevents overselling, defines publish semantics |
| 3 | 1.1 Component library | Built once, reused per tenant |
| 4 | 1.2 Storefront editor | Tenant-facing configuration |
| 5 | 1.3 Storefront runtime | Actual live customer site |
| 6 | 2.1–2.4 Orders module | Depends on live orders flowing in from Phase 1 |
