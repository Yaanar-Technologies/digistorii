# E-Commerce Module — Build Plan & Prompt Pack
### For: Multi-tenant POS Billing SaaS (adding Storefront + Orders) starting with Phase 0 will provide others next
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
> Extend the `companies` table as follows:
> ```sql
> ALTER TABLE companies
>   ADD COLUMN custom_domain VARCHAR(255) UNIQUE,
>   ADD COLUMN custom_domain_status VARCHAR(20) NOT NULL DEFAULT 'not_configured'
>     CHECK (custom_domain_status IN ('not_configured','pending_dns','verified','failed')),
>   ADD COLUMN custom_domain_verified_at TIMESTAMP;
> ```
> Every place that decides "can this tenant use ecom features" (Store Settings visibility, storefront routing, publish button) must check `company_subscriptions.ecommerce_access = true` for that company — this keeps INSTORE-plan tenants correctly locked out without a second flag to keep in sync.
> Build middleware that resolves an incoming request to a tenant in one lookup against `companies` (by path segment `digistorii/{subdomain_url}` OR by `custom_domain` if verified), returning `schema_name` + `company_id`. Cache this resolution (Redis, short TTL) since it will run on every storefront request. **Nothing past this middleware layer should ever see `subdomain_url` or `custom_domain` again** — pass `company_id` down, not the domain string. This is what makes renaming a subdomain or swapping in a custom domain later a zero-risk operation: only this one lookup changes.
>
> Add a DNS verification flow: tenant enters `custom_domain` in Store Settings → status becomes `pending_dns` → show them the required CNAME record → poll/verify → flip to `verified`. Until verified, the platform subdomain keeps working as fallback.

### 0.2 Tenant Identifier Convention (fix going forward)
**Prompt:**
> For every new ecom table below: do not add a `tenant_id VARCHAR` column populated from `subdomain_url` (the pattern seen in some existing tables like `stock_ledger`). Since these tables live inside the tenant's own Postgres schema, the schema itself is the isolation boundary — no tenant_id column is needed at all in most cases. Where a table needs to reference the parent company explicitly (e.g. for a cross-schema reporting job), use `company_id INT` (immutable), never the domain string. Do not touch the existing `tenant_id VARCHAR` columns in older tables — that's separate cleanup, not a blocker here.

### 0.3 Ecom Store Settings (tenant schema, one-time setup, gates Publish)
Not when ecommerce_access is false as the only tables that have to be created are public tables
**Prompt:**
> Inside `createCompanySchema`, utilize function where all these table are created `createEcomSchema` where these tables have to be created only when " ecommerce_access" == TRUE " in plan_features accoriding plan selected not when ecomm access is false  
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
Create `ecom_access` similar to `purchase_access` in pp sidebar add all of these below pages within them . show this only for plan with ecom_access=true. and pages for them within `src/app/[company]/(user)/workspace/ecom-config` as new folders. 
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
> This is the starting-stage build: give Workspace User the ability to sell the *same* product on ecom at a different price, and/or apply ecom-only discounts, without touching how POS pricing/discounts work.
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
