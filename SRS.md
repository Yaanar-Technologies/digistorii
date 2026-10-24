# Software Requirements Specification — Digistorii Unified Retail & E-Commerce Platform

| | |
|---|---|
| **Document version** | 1.0 (baseline, derived from code analysis) |
| **Date** | 2026-10-23 |
| **Branch analysed** | `fix/signed-sessions` (working tree, uncommitted changes included) |
| **Scope** | Whole product: platform/SaaS layer, back-office (ERP/POS) and the e-commerce storefront |
| **Method** | Static review of `server.js`, `src/middleware.ts`, `src/lib/*`, the DB schema/migration files, and a sample of API routes. No runtime or penetration testing was done. |

> **How to read this document.** Sections 1–9 describe what the system does today, each
> marked **[Implemented]**, **[Partial]** or **[Planned]**. Section 10 (Security) lists
> gaps found in the code, ranked by severity. They are *requirements that are not yet met*,
> so read it before any go-live decision. Section 13 lists the open questions.

---

## 1. Introduction

### 1.1 Purpose
Define the functional and non-functional requirements of Digistorii, a multi-tenant SaaS that gives
a retail business one operational core for purchasing, inventory, point-of-sale (POS) billing and an
online storefront.

### 1.2 Scope
In scope:
- **Platform layer** – tenant onboarding, plans/seats/billing, custom domains, platform admin.
- **Back-office ("workspace")** – masters, procurement, inventory, sales/POS, reports, user responsibilities.
- **E-commerce** – storefront theme/catalogue, customer accounts, cart/wishlist, checkout, payments, order fulfilment, delivery webhooks, refunds.

The POS module is treated as complete; it is described only where e-commerce depends on it
(shared stock, pricing, customers, tax).

### 1.3 Definitions
| Term | Meaning |
|---|---|
| Tenant / Company | One customer business. Identified by `subdomain_url` (the "company slug"). |
| Schema | The PostgreSQL schema that holds one tenant's data (`companies.schema_name`). |
| Workspace | Staff UI at `/{company}/workspace/*`. |
| Admin console | Per-tenant admin UI at `/{company}/admin/*` (user management). |
| Storefront | Customer-facing shop at `/{company}/store/*`. |
| Variant | Sellable unit (`product_variants`): SKU, colour, size, etc. All stock, price and order lines refer to variants. |
| Responsibility | A named set of boolean module permissions assigned to a staff user. |
| GRN | Goods Receipt Note. PO = Purchase Order. AWB = Air Waybill. RTO = Return to Origin. |

### 1.4 Technology baseline (as built)
| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript, Tailwind 4, Ant Design / MUI |
| Runtime | **Custom Node server** (`server.js`) wrapping Next, plus Socket.IO and `node-cron` |
| Database | PostgreSQL (`pg` pool), **schema-per-tenant**; `public` schema holds platform tables |
| Auth | Signed JWT (HS256, `jose`) in httpOnly cookies; passwords hashed with bcrypt (staff) / scrypt (storefront customers) |
| Payments | Razorpay (orders, signature verification, webhooks, refunds) |
| Files | Vercel Blob (images) |
| Email | Nodemailer (SMTP) |
| Money | `decimal.js` for pricing maths |
| Deployment hints | `vercel.json` with one cron entry. (See §10, finding S-13: a custom server and Vercel serverless are not compatible.) |

---

## 2. Overall description

### 2.1 Product perspective
```
 Customer browser ──► /{company}/store/*  ─┐
 Staff browser    ──► /{company}/workspace/* ─┤  Next.js (middleware: tenant resolve + page auth)
 Tenant admin     ──► /{company}/admin/*   ─┤        │
 Razorpay / Courier ─► /api/{company}/ecom/webhooks/* │
                                              ▼        ▼
                                        API route handlers ──► PostgreSQL
                                              │                 ├─ public.*            (platform)
                          Socket.IO (notifications)             └─ "<tenant_schema>".* (tenant data)
                          node-cron (cleanup, billing)
```

### 2.2 Actors
| Actor | Description | Entry point |
|---|---|---|
| Platform operator | Runs the SaaS: plans, tenant lifecycle | `/get-service`, `/setup`, `public.*` tables |
| Tenant administrator | Configures a business, users, billing | `/{company}/admin`, workspace Settings |
| Staff user | Works under a *Responsibility* (see §6) | `/{company}/workspace` |
| Storefront customer | Buys online; identified by phone/email | `/{company}/store` |
| Payment gateway | Razorpay calls webhook | `/api/{company}/ecom/webhooks/razorpay` |
| Courier partner | Pushes delivery status | `/api/{company}/ecom/webhooks/delivery/{partner}` |
| Scheduler | Cron releases stock, expires subscriptions | `server.js`, `/api/internal/cron/*` |

### 2.3 Assumptions and constraints
- One Postgres database; all tenants share it. Tenant isolation depends entirely on correct schema selection in application code (§7).
- India-first: INR, GST (CGST/SGST/IGST), Indian phone/PIN validation, Razorpay.
- Table creation and `ALTER`s run at server start (`ensureDB`), not through versioned migrations.

---

## 3. System architecture (as built)

### 3.1 Request flow
1. **Middleware** (`src/middleware.ts`) runs for *page* requests only. The matcher is `/((?!_next|api|favicon.ico).*)`, so **API routes never pass through it**.
2. It resolves the tenant from the first path segment (or `/digistorii/{slug}`), or from the `Host` for custom domains, by calling `/api/resolve-tenant`, and sets `x-tenant`, `x-schema-name`, `x-company-id`.
3. For `/admin/*` and `/workspace/*` it verifies the JWT cookie, checks `company_name` equals the URL company and checks the route permission (`accessControl.ts`). `/store/*`, login and reset pages are public.
4. API handlers read the tenant from request headers via `getTenantSchema(req)` or from a URL param via `getTenantSchemaByCompany(company)`, then query `"<schema>".table` directly.

### 3.2 Background jobs
| Job | Where | Schedule | Purpose |
|---|---|---|---|
| Reservation / abandoned-cart cleanup | `server.js` (`node-cron`) | every 5 min (`ENABLE_CRON`) | Release unpaid holds, cancel stale prepaid orders |
| Billing sync + expiry e-mails | `lib/cron.ts` | Sundays 00:00 | Mark expired subscriptions, send 7-day and expiry e-mails |
| Cleanup via HTTP | `/api/internal/cron/cleanup` (POST, `x-cron-secret`), `/release-reservations` (GET/POST, Bearer) | Vercel cron: every 2 days | External trigger |

### 3.3 Real-time
Socket.IO is attached to the same HTTP server. Clients emit `join_user_room(userId)` and receive notifications in room `user:{id}`.

---

## 4. Data model overview

### 4.1 Platform schema (`public`) — [Implemented]
`companies` (slug, schema, status, custom domain + status), `users`, `company_user_map`, `plans`, `plan_features`,
`company_subscriptions` (seats, warehouse/location limits, `ecommerce_access`, period dates, status), `payments`
(subscription/seat payments with Razorpay ids), `onboarding_otps`, plus responsibility tables.

### 4.2 Tenant schema groups — [Implemented]
| Group | Main tables |
|---|---|
| Masters | `tax_master`, `tax_component`, `uom`, `currencies`, `currency_rates`, `payment_modes`, `payment_terms`, `despatch_terms`, `product_categories/materials/fittings/colors`, `suppliers`, `customers`, `customer_addresses`, `company_settings`, `business_settings`, `user_settings` |
| Catalogue | `products`, `product_variants`, `image_master`, `product_images`, `product_pricing`, `discounts`, `discount_variants`, import-batch tables |
| Inventory | `locations`, `warehouses`, `locators`, `inventory`, `stock_layers`, `stock_ledger`, `sales_allocations`, `opening_stock*`, `stock_adjustments*` |
| Procurement | `purchase_header/detail`, `grn_header/detail`, `purchase_returns*` |
| Sales / POS | `sales_header/detail`, `sales_payments`, `sales_returns*` |
| E-commerce | `ecom_settings`, `storefront_config`, `storefront_products`, `ecom_price_overrides`, `inventory_reservations`, `customer_ecom_auth`, `cart_items`, `wishlist_items`, `online_orders`, `online_order_items`, `online_order_payments`, `online_order_status_history`, `online_order_deliveries`, `payment_gateway_configs`, view `ecom_available_stock` |
| Cross-cutting | `audit_log`, `notifications`, `notification_subscriptions`, `notification_recipients` |

> **Legacy duplicate.** `lib/ecomTables.ts` defines an older set (`ec_customers`, `ec_orders`, `ec_cart`, `ec_payments`, `ec_shipments` …). Current routes use the `online_*` and shared `customers` tables. See §12 (D-2).

---

## 5. Functional requirements

Priority: **M** must, **S** should, **C** could. Status: ✅ implemented, 🟡 partial, ⬜ not started.

### 5.1 Platform & tenant management
| ID | Requirement | Pri | Status |
|---|---|---|---|
| FR-PL-1 | A new business can self-onboard (company details, admin user, OTP e-mail verification, guided setup). | M | ✅ |
| FR-PL-2 | Each tenant gets its own schema created and migrated automatically. | M | ✅ |
| FR-PL-3 | Plans define seats, warehouses, locations and `ecommerce_access`; limits are enforced on user/warehouse/location creation. | M | 🟡 (limits modelled; verify every create path enforces them) |
| FR-PL-4 | Tenants can buy extra seats and renew plans through Razorpay, with server-side signature verification. | M | ✅ |
| FR-PL-5 | Expired subscriptions block staff login and send warning (7 days) and expiry e-mails. | M | ✅ (login blocked; storefront is **not** blocked, see S-12) |
| FR-PL-6 | A tenant can attach a custom domain; it is used only when status is `verified`. | S | 🟡 (no DNS-verification flow in code) |
| FR-PL-7 | Platform operator console for tenants, plans and revenue. | S | ⬜ |

### 5.2 Staff authentication & access control
| ID | Requirement | Pri | Status |
|---|---|---|---|
| FR-AU-1 | Staff log in with e-mail/password per company (`/api/auth/login`); the session is a signed JWT in an httpOnly cookie (12 h). | M | ✅ |
| FR-AU-2 | Separate admin login (`/api/admin/login`) with its own cookie. | M | ✅ |
| FR-AU-3 | Forgot/reset password by e-mail. | M | ✅ |
| FR-AU-4 | Pages are gated by 8 module permissions (`dashboard, purchase, inventory, sales, sales_billing, reports, settings, ecommerce`). | M | ✅ for pages; ❌ for APIs (S-1) |
| FR-AU-5 | Administrators define Responsibilities and assign them to users. | M | ✅ |
| FR-AU-6 | Warehouse-restricted users (`warehouse_id` in session). | S | 🟡 |

### 5.3 Master data & catalogue
| ID | Requirement | Pri | Status |
|---|---|---|---|
| FR-MD-1 | CRUD for categories, materials, fittings, colours, UOM, tax (GST components), currencies and rates, payment modes/terms, despatch terms, locations, warehouses, locators. | M | ✅ |
| FR-MD-2 | Products with variants (SKU auto-generation, barcode validation and internal-barcode generation, per-variant low-stock threshold, backorders flag). | M | ✅ |
| FR-MD-3 | Bulk product import/export (Excel template, mapping templates, batch tracking). | S | ✅ |
| FR-MD-4 | Image master (single and v2 with tags/import) on Vercel Blob. | S | ✅ |
| FR-MD-5 | Pricing: standard price lists with effective dates; **e-commerce price overrides** per variant (`use_custom_pricing`). | M | ✅ |
| FR-MD-6 | Discounts: percentage/fixed, per variant or all, **channel** (`pos`, `ecom`, `both`), optional coupon code, date window. | M | ✅ |
| FR-MD-7 | Auto-numbering for documents (PO, GRN, sales, product codes). | M | ✅ |

### 5.4 Procurement
| ID | Requirement | Pri | Status |
|---|---|---|---|
| FR-PR-1 | Supplier master with GSTIN, terms, currency. | M | ✅ |
| FR-PR-2 | Purchase order with lines, tax, discount, attachments; renew PO. | M | ✅ |
| FR-PR-3 | Approval workflow: pending → approved / rejected (reason mandatory). | M | ✅ |
| FR-PR-4 | GRN against an approved PO posts to the stock ledger. | M | ✅ |
| FR-PR-5 | Purchase returns with debit tracking. | M | ✅ |
| FR-PR-6 | PO/GRN/PO-summary reports. | S | ✅ |

### 5.5 Inventory
| ID | Requirement | Pri | Status |
|---|---|---|---|
| FR-IN-1 | Warehouse → locator hierarchy; stock per variant/warehouse/locator. | M | ✅ |
| FR-IN-2 | Every movement (opening, GRN, sale, adjustment, return) is written to `stock_ledger`; sales consume `stock_layers` FIFO. | M | ✅ |
| FR-IN-3 | Opening stock and stock adjustments with reason; stock-ledger report. | M | ✅ |
| FR-IN-4 | Low-stock check after movements raises notifications. | S | ✅ |
| FR-IN-5 | **Available-to-sell** for e-commerce = on-hand − active holds − converted holds (view `ecom_available_stock`). | M | ✅ |
| FR-IN-6 | Ledger is append-only (no UPDATE/DELETE by application code). | M | 🟡 (enforced by convention, not by DB permission/trigger) |

### 5.6 POS / sales (summary only)
Billing with barcode input, split tender (`sales_payments`), sales returns, bill print and sales reports. **Complete per project notes.** E-commerce reuses its tax logic, customers table and stock ledger.

### 5.7 E-commerce: configuration & storefront
| ID | Requirement | Pri | Status |
|---|---|---|---|
| FR-EC-1 | Per-tenant `ecom_settings`: payment mode (`cod_only` / `prepaid_only` / `both`), gateway keys (encrypted), delivery partner and secrets (encrypted), serviceable countries/states/pincodes, shipping fee and free-shipping threshold, policies text, support contacts, flags for custom price/discount use. | M | ✅ |
| FR-EC-2 | Gateway and delivery secrets are encrypted with AES-256-GCM using the platform `ENCRYPTION_KEY` and shown masked. | M | ✅ for `ecom_settings`; ❌ `payment_gateway_configs` stores `key_secret` in plain text (S-9) |
| FR-EC-3 | Theme studio with **draft vs published** theme (JSONB, versioned) and theme assets. | M | ✅ |
| FR-EC-4 | Merchant selects which variants are live on the storefront and orders them (`storefront_products`). | M | ✅ |
| FR-EC-5 | Storefront pages: home, product list/detail, cart, wishlist, checkout, account. | M | 🟡 (detail polish, filters, sort, pagination pending) |
| FR-EC-6 | Policy pages (terms, privacy, returns) rendered from settings. | S | ⬜ |
| FR-EC-7 | SEO: per-page meta, sitemap, structured data. | S | ⬜ |

### 5.8 E-commerce: customer account
| ID | Requirement | Pri | Status |
|---|---|---|---|
| FR-CU-1 | Customer registers/logs in with e-mail + password (`/api/ecom/auth/*`) or **phone OTP** (`/api/storefront/auth/*`). One shared `customers` row per person across POS and online (`channel`: `pos`/`ecom`/`both`). | M | ✅ |
| FR-CU-2 | Session: signed JWT cookie `customer_session`, 7 days, tied to a company slug. | M | ✅ |
| FR-CU-3 | OTP: 6 digits, SHA-256 hashed, 5-minute expiry, attempt counter. Delivery by SMS provider. | M | 🟡 (no SMS provider; OTP returned in API response, see S-5) |
| FR-CU-4 | Saved addresses with Indian PIN validation, default address, recipient name/phone. | M | ✅ |
| FR-CU-5 | Order history, order detail, reorder, return request, notification preferences. | S | 🟡 history only |
| FR-CU-6 | Server-side cart and wishlist, with guest→account merge. | M | ✅ (`/api/tenant/{company}/cart|wishlist`) |

### 5.9 E-commerce: checkout and order placement
**Flow (as implemented in `/api/{company}/ecom/checkout`)**
1. Client posts `customerId`, shipping/billing address ids, `paymentMethod` (`upi|card|netbanking|wallet|cod`), `items[]`, optional `couponCode`, optional `idempotencyKey`.
2. Server validates the method against `ecom_settings.payment_mode` and, for prepaid, that an active gateway exists.
3. `BEGIN`; lock the customer row (`FOR UPDATE`); look for an existing unpaid prepaid order to resume (idempotency).
4. For each line: read the **live** price (e-commerce override → price list), tax, auto-discount; **client prices are ignored**.
5. Apply coupon (percentage/fixed, all or specific variants); compute shipping from `shipping_fee` and `shipping_free_threshold`; compute tax per line.
6. Create `online_orders`, `online_order_items`, hold stock in `inventory_reservations` (TTL `RESERVATION_TIMEOUT_MINUTES`, default 30).
7. Prepaid: create a Razorpay order with the **tenant's own** keys and return `razorpay_order_id`/`key_id`. COD: order stays `placed`/`pending` awaiting merchant confirmation.
8. `COMMIT`.

| ID | Requirement | Pri | Status |
|---|---|---|---|
| FR-CO-1 | Prices, discounts, tax and shipping are computed server-side only. | M | ✅ |
| FR-CO-2 | Stock is reserved atomically at order creation; oversell is prevented. | M | 🟡 (verify row-level locking on stock rows, not only on the customer row) |
| FR-CO-3 | Coupon validation with clear error messages and per-customer/total usage limits. | M | 🟡 (coupons applied; no usage limit found) |
| FR-CO-4 | Serviceability check (country/state/pincode) at checkout. | M | ❌ settings exist but checkout does not check them (D-11) |
| FR-CO-5 | Checkout is idempotent (`idempotencyKey` / resume of unpaid order). | M | ✅ |
| FR-CO-6 | The authenticated customer, not a request-body value, determines `customerId`. | M | ❌ (S-3) |
| FR-CO-7 | Guest checkout. | C | ⬜ |
| FR-CO-8 | Unpaid prepaid orders older than the TTL are auto-cancelled and their stock released. | M | ✅ |

### 5.10 E-commerce: payments
| ID | Requirement | Pri | Status |
|---|---|---|---|
| FR-PY-1 | Razorpay order per prepaid order, using tenant keys (decrypted at use). | M | ✅ |
| FR-PY-2 | Client callback `/payment/verify` verifies `HMAC_SHA256(order_id|payment_id)` with timing-safe compare before marking paid. | M | ✅ |
| FR-PY-3 | Webhook `/webhooks/razorpay` verifies `x-razorpay-signature` over the **raw body** with the tenant's webhook secret; handles `payment.authorized/captured/failed` and refund events idempotently; always replies 200 after a valid signature. | M | ✅ |
| FR-PY-4 | Cash on delivery: payment marked paid when delivery is confirmed. | M | 🟡 |
| FR-PY-5 | Failed/pending payment retry from the account page. | S | ⬜ |
| FR-PY-6 | Refund on cancellation of a paid order is issued through Razorpay with an idempotency key, and tracked as a refund row. Partial refunds for item returns. | M | 🟡 (full refund on cancel ✅; partial and return refunds ⬜) |
| FR-PY-7 | Invoice PDF with GST breakup, e-mailed to the customer. | M | ⬜ |

> Design note: `webhooks/razorpay/route.ts` states the webhook is the *only* source of truth for payment status, but `payment/verify` also marks orders paid. Both are safe because both verify signatures and the state machine rejects illegal repeats. Pick one authoritative path in the spec; recommended: webhook authoritative, verify route only reads status.

### 5.11 E-commerce: order management and state machine
Implemented in `lib/orderStateMachine.ts`. Three independent state dimensions per order, each with an adjacency map, each transition written to `online_order_status_history` (from, to, actor, note, time):

```
ORDER    placed ─► confirmed ─► packed ─► shipped ─► out_for_delivery ─► delivered ─► returned ─► refunded
           │  ▲        │          │                       │  ▲                          ▲
           │  └─ payment_failed   └────► cancelled        └──┘ (packed: retry)          └─ also from shipped/out_for_delivery
           └──► cancelled / payment_failed
PAYMENT  pending ─► authorized ─► paid ─► refunded | partial      (failed ⇄ pending/paid)
DELIVERY not_shipped ─► picked_up ─► in_transit ─► out_for_delivery ─► delivered
                          └────────► failed_delivery ─► out_for_delivery | rto | not_shipped
```

| ID | Requirement | Pri | Status |
|---|---|---|---|
| FR-OM-1 | Illegal transitions are rejected with a typed error (`OrderTransitionError`). | M | ✅ |
| FR-OM-2 | Staff actions: confirm, allocate, pack, ship (courier + AWB), mark-delivered, cancel, each under a transaction. | M | ✅ |
| FR-OM-3 | Confirm: allowed only if paid or COD; converts `held` reservations to `converted`. Pack: all lines must be `allocated`. Ship: needs a delivery record with an AWB. Delivered: stamps `delivered_at` and marks COD paid. Cancel: releases `held` reservations and refunds if paid. | M | 🟡 see D-9, D-10 (stock ledger is never posted; cancelling a confirmed order leaks stock) |
| FR-OM-4 | Per-line fulfilment status: `pending → reserved → allocated → fulfilled / cancelled`. | M | ✅ |
| FR-OM-5 | Courier webhook (`/webhooks/delivery/{partner}`) verifies a per-tenant signature secret and drives the delivery status. | M | ✅ |
| FR-OM-6 | Admin order list with filters/search/pagination, order detail with timeline, internal notes. | M | 🟡 basic list |
| FR-OM-7 | Customer cancellation window (cancel before `packed`, configurable). | S | ⬜ |
| FR-OM-8 | Return/exchange request, reverse pickup, QC, restock, refund. | M | ⬜ (state exists, no workflow) |
| FR-OM-9 | Order confirmation/dispatch/delivery notifications by e-mail, SMS, WhatsApp. | M | ⬜ |
| FR-OM-10 | System actions (auto-cancel, reservation release) must also be written through the state machine so history stays complete. | M | ❌ (cleanup job updates tables directly, see D-3) |

### 5.12 Delivery & logistics
| ID | Requirement | Pri | Status |
|---|---|---|---|
| FR-DL-1 | Pincode/state/country serviceability and flat shipping fee with free threshold. | M | 🟡 |
| FR-DL-2 | Zone, weight, and order-value-based rates. | S | ⬜ |
| FR-DL-3 | Courier abstraction (`delivery_partner`, credentials encrypted, `online_order_deliveries` with AWB, tracking URL, timestamps). | M | 🟡 (webhook receiver ready; no outbound shipment-creation API) |
| FR-DL-4 | Customer tracking page, delivery estimate, POD (OTP/photo), failed-delivery retry limits and RTO automation. | S | ⬜ |

### 5.13 Reporting & analytics
Existing dashboard APIs: metrics, monthly sales, sales vs purchase, top customers/products/suppliers, PO/GRN status, payment breakdown, recent orders, stock-ledger report.

| ID | Requirement | Pri | Status |
|---|---|---|---|
| FR-RP-1 | Online sales, orders by status, delivery performance, returns/refunds, top online products, coupon usage, customer cohorts. | S | ⬜ |
| FR-RP-2 | Dashboard figures separate POS vs online channel. | S | 🟡 |

### 5.14 Notifications
In-app notifications (DB + Socket.IO) for low stock and operational alerts; subscription e-mails by SMTP.
External customer messaging (SMS/WhatsApp/e-mail templates, preferences, opt-out) is ⬜.

---

## 6. Role and permission model

| Responsibility (default) | dashboard | purchase | inventory | sales | billing | ecommerce | reports | settings |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Admin | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Other defaults | configured in `userResponsibilities.ts`; tenants can create their own |

- Permissions are copied into the JWT at login. A change to a user's responsibility **does not apply until re-login** and, for 12 h, a removed user keeps access (§10, S-8).
- Permissions are checked for **pages** (middleware). There is no equivalent check for API routes (§10, S-1).
- Customers use a different cookie and cannot reach staff pages, because staff verification requires `type = "staff"`.

---

## 7. Multi-tenancy requirements

### 7.1 Current design
- **Isolation model**: schema-per-tenant in one database. Platform data lives in `public`.
- **Tenant identification**: path slug (`/{company}/…`), `/digistorii/{slug}` alias, verified custom domain, or `x-tenant` header.
- **Provisioning**: schema + all tables created by `schema.ts` / `ecomTables` / `locationSchema` on onboarding and re-checked at every server start.
- **Entitlements**: `company_subscriptions.ecommerce_access` gates tenant resolution for e-commerce hosts; seat/warehouse/location limits stored per tenant.
- **Per-tenant secrets**: gateway and courier keys encrypted with one platform key.
- **Per-tenant configuration**: theme, policies, serviceable areas, shipping, payment mode.

### 7.2 Requirements
| ID | Requirement | Status |
|---|---|---|
| MT-1 | A request may only touch the schema of the tenant that the authenticated principal belongs to. | ❌ Tenant comes from client-controlled headers/params and is not compared with the session on most API routes (S-1, S-2). |
| MT-2 | Tenant and schema identifiers must never be taken from the client unverified; schema names must be validated against `^[a-z0-9_]+$` or looked up server-side every time before being placed in SQL. | ❌ `getTenantSchema` returns `x-schema-name` as sent; SQL interpolates it. |
| MT-3 | A customer session is valid for one company only. | ✅ `getStorefrontCustomerSession` compares the company; checkout does not use it (S-3). |
| MT-4 | One tenant's cache, rate limits, queues, logs and files must not leak to another (Blob paths prefixed by tenant). | 🟡 not reviewed for Blob paths; `resolve-tenant` cache is keyed per host/slug ✅ |
| MT-5 | Suspending a tenant (expired subscription) disables staff **and** storefront/checkout. | 🟡 staff only |
| MT-6 | Schema migrations are versioned, run once, and applied to all tenants with a recorded version. | ❌ run on every startup, per call to `ensureDB` |
| MT-7 | Tenant-level backup, export and deletion procedure. | ⬜ |
| MT-8 | Reserved slugs (`api`, `setup`, `get-service`, `digistorii`, `admin`, `store`) cannot be registered as a company. | ❓ verify |
| MT-9 | Scale plan: schema count growth, connection pooling (PgBouncer), noisy-neighbour limits. | ⬜ |

---

## 8. External interfaces

| Interface | Direction | Auth | Notes |
|---|---|---|---|
| Razorpay Orders/Payments/Refunds | out | tenant key id + secret | Per tenant for storefront; platform key for subscriptions |
| Razorpay webhook | in | HMAC-SHA256 raw body, per-tenant secret | ✅ constant-time compare |
| Courier webhook `/webhooks/delivery/{partner}` | in | HMAC with per-tenant secret | ✅ |
| SMTP | out | env credentials | Subscription and onboarding mails |
| SMS / WhatsApp | out | — | ⬜ not integrated |
| Vercel Blob | out | `BLOB_READ_WRITE_TOKEN` | Product/theme images |
| Cron endpoints | in | `x-cron-secret` / Bearer `CRON_SECRET` | ✅ fail-closed when secret missing |

---

## 9. Non-functional requirements

| ID | Category | Requirement | Status |
|---|---|---|---|
| NFR-1 | Performance | Storefront pages: LCP < 2.5 s on 4G; list APIs paginated; indexes on `online_orders` (customer, status, payment_status) exist. | 🟡 not measured |
| NFR-2 | Availability | 99.5 % monthly; zero-downtime deploys; the reservation job must be safe to run on several instances. | ⬜ (single custom server; `global.cronInitialized` is per process) |
| NFR-3 | Data integrity | Order, stock and payment changes are inside transactions; state transitions validated; payments idempotent. | ✅ mostly |
| NFR-4 | Auditability | Order history and `audit_log`; every change has actor and time. | 🟡 |
| NFR-5 | Observability | Structured logs without secrets/PII, error tracking, uptime and queue metrics, alerting on webhook failures. | ❌ currently `console.log` (logs login e-mails, full SQL text) |
| NFR-6 | Maintainability | Typed API contracts, shared auth/tenant helper, automated tests. | ❌ no tests present |
| NFR-7 | Compatibility | Latest 2 versions of Chrome, Safari, Edge, Firefox; mobile-first storefront. | 🟡 |
| NFR-8 | Localisation | INR / GST first; currency table exists for multi-currency. | 🟡 |
| NFR-9 | Backup & DR | Daily backups, point-in-time recovery, restore drill, RPO ≤ 15 min, RTO ≤ 4 h. | ⬜ |
| NFR-10 | Privacy | Customer PII (name, phone, e-mail, address) handled per India DPDP Act: consent, purpose, deletion/export on request, retention policy. | ⬜ |

---

## 10. Security requirements and findings

This section combines **requirements** and the **current gaps** found while reading the code.
Severity: **Critical** = exploitable now with little effort; **High**; **Medium**; **Low**.
These are static-analysis findings. Confirm each with a quick test before fixing.

### 10.1 What is already good
- Sessions are signed JWTs (HS256) in httpOnly, `SameSite=Lax`, `Secure` (production) cookies; `JWT_SECRET` is required (fails if missing).
- Staff pages verify signature, company match and module permission.
- Webhooks: raw-body HMAC with constant-time comparison, per-tenant secrets, idempotent handling.
- Payment verify: server-side HMAC check; amounts and prices are computed server-side.
- Gateway/courier secrets encrypted with AES-256-GCM; masked helper exists.
- Passwords hashed (bcrypt for staff, salted scrypt + `timingSafeEqual` for customers).
- Cron endpoints fail closed when `CRON_SECRET` is missing.
- Razorpay refunds use an idempotency key; unique index on `gateway_order_id`.
- Delivery/phone/PIN/e-mail validators exist (`customerAuth.ts`).

### 10.2 Findings

| ID | Sev | Finding | Evidence | Required fix |
|---|---|---|---|---|
| **S-1** | **Critical** | **Most back-office API routes have no authentication or permission check.** The middleware matcher excludes `/api`, and ~180 route files exist but only ~27 reference a session/cron check. Routes such as `products`, `customers`, `sales`, `grn`, `pricing`, `admin/users`, `admin/billing/*`, `dashboard/*`, `company/ecom-settings` call `getTenantSchema()` and run queries without verifying a user. | `middleware.ts` matcher; grep of `app/api` | One shared `requireStaff(req, permission)` guard called by every handler (or a wrapper), default-deny; then add a test that fails if a new route lacks it. |
| **S-2** | **Critical** | **Tenant is chosen by the client.** For `/api/*`, the middleware never resolves a tenant (first segment is `api`), so `getTenantSchema` trusts `x-schema-name`, `x-tenant`, `x-company-id` sent by the browser. Because schema names are interpolated into SQL (`"${schema}".table`), a caller can read or write **any tenant's data**, and the header is also an **SQL-injection** vector. | `lib/tenant.ts`, `middleware.ts` lines 47–57 | Strip these headers on every request; derive the schema from the verified session (staff) or from the URL company via a DB lookup (public); validate identifiers with a whitelist regex; compare session `company_id` with the resolved tenant. |
| **S-3** | **Critical** | **Checkout trusts `customerId` from the request body** and does not read the customer session. Any visitor can place orders (and consume stock) in another customer's name; `payment/verify` and order APIs need the same ownership check. | `checkout/route.ts` lines 77–100 | Take the customer id from `getStorefrontCustomerSession`; ignore the body value; verify that address ids belong to that customer. |
| **S-4** | **Critical** | **Live secrets are committed.** `.env.local` is tracked in git (`git ls-files` lists it; changed in several commits) and contains DB, JWT, SMTP, Razorpay and Blob credentials. `.gitignore` ignores only `.env`. | `git ls-files`, `.gitignore` | Rotate **all** credentials now, `git rm --cached .env.local`, add `.env*` to `.gitignore`, purge history (`git filter-repo`), use platform env storage. |
| **S-5** | **High** | **OTP exposed in API response** (`sample_text` contains the code) and no SMS provider. There is no rate limit on send/verify, so OTP floods and SMS-pumping are possible; 6-digit codes with an attempt counter are brute-forceable if the counter is not enforced across resend. | `storefront/auth/send-otp/route.ts` | Remove `sample_text`; integrate SMS provider; limit per phone/IP/tenant; cap attempts and lock out; resend cooldown. |
| **S-6** | **High** | **Staff order actions fall back to an unauthenticated mode**: `confirm/cancel/pack/ship/...` verify the session only `if (userCookie)`; with no cookie they continue and take the actor name from the `x-user-name` header. | `orders/[orderId]/confirm/route.ts` lines 8–36 | Require a valid staff cookie, company match and `ecommerce_access`; ignore `x-user-name`. |
| **S-7** | **High** | **Socket.IO is open**: `cors: origin "*"`, no handshake auth, and any client can `join_user_room(anyUserId)` and receive that user's notifications. | `server.js` lines 51–66 | Verify the JWT on connection, derive the room from it, restrict origins to tenant domains. |
| **S-8** | **High** | **No session revocation and stale permissions.** JWT carries permissions for 12 h (staff) / 7 days (customers); disabling a user or changing a role has no effect until expiry. No login throttling, lockout, or MFA. | `session.ts`, login routes | Short access token + refresh/session table or per-request `token_version` check; login rate limit; optional TOTP for admins. |
| **S-9** | **High** | **Two places store gateway keys**; `payment_gateway_configs.key_secret` is plain text while `ecom_settings.*_enc` is encrypted. Checkout reads the former. | `schema.ts` §12; `checkout` | Migrate to a single encrypted store; drop the plain table; support key rotation (store key version). |
| **S-10** | **Medium** | **No rate limiting anywhere** (login, register, OTP, checkout, coupon validate, `product-lookup`). Coupon validation is enumerable. | — | Add edge/gateway or Redis-based limits per IP + account. |
| **S-11** | **Medium** | **No CSRF defence beyond `SameSite=Lax`**; state-changing routes accept JSON from any origin with cookies when Lax rules allow. No security headers (CSP, HSTS, frame-ancestors, X-Content-Type-Options). | `next.config.js` | Origin check on mutations; add headers; CSP for storefront theme HTML/CSS. |
| **S-12** | **Medium** | **Tenant state is not enforced on storefront/API**: expired or suspended tenants can still serve storefront and take payments; only staff login checks expiry. | `auth/login`, `resolve-tenant` | Check `companies.status` and subscription in the shared tenant resolver. |
| **S-13** | **Medium** | **Deployment mismatch.** `server.js` (custom server, Socket.IO, `node-cron`) cannot run on Vercel serverless, yet `vercel.json` defines a cron that fires every 2 days while reservations expire after 30 min. Two schedulers (node-cron and Vercel) may both run. | `server.js`, `vercel.json` | Choose a target: (a) VM/container with the custom server, or (b) serverless with Vercel cron every 5 min and a hosted realtime service. Add a DB advisory lock so the job is single-flight. |
| **S-14** | **Medium** | `db.ts` uses `ssl: { rejectUnauthorized: false }` for non-local DBs (accepts any certificate) and logs full SQL text on every `query()`. | `lib/db.ts` | Verify certificates with the provider CA; log query names/duration only. |
| **S-15** | **Medium** | Order numbers use `Math.random()` (guessable, collision-prone); login handler logs the e-mail; error messages return internal `err.message` to clients. | `checkout` line ~30; login route | Use `crypto.randomInt`/sequence; scrub logs; map errors to generic messages with a correlation id. |
| **S-16** | **Medium** | `resolveCompanySlug` accepts company from body, query, several headers, the `Referer`, or **"the only company in the DB"** as a fallback. | `customerAuth.ts` | Use one source (URL param validated against DB); remove the fallback. |
| **S-17** | **Low** | Custom-domain detection is "host does not contain `digistorii`/`localhost`/`platform.com`", so hostile Host headers are treated as custom domains and trigger a DB lookup per request (10 s cache). | `middleware.ts` line 22 | Compare against an explicit platform-hosts list; negative-cache misses. |
| **S-18** | **Low** | Product/theme image upload accepts files by type detection (`file-type` present) but size limits, tenant-prefixed paths and malware scanning are not specified. | `image-master*` | Enforce size/type allow-list, tenant path prefix, `Content-Disposition`. |
| **S-19** | **Low** | `xlsx@0.18.5` (SheetJS community build) has known prototype-pollution/ReDoS advisories and is used for imports. | `package.json` | Upgrade to the maintained distribution or validate/size-limit uploads. |

### 10.3 Security requirements to adopt (target state)
1. **Default-deny API**: a single authorization wrapper; every route declares `{ audience: staff|customer|public|webhook|cron, permission? }`.
2. **Tenant context only from server-verified sources**; reject requests where `session.company_id ≠ tenant.company_id`.
3. **Least privilege DB**: application role without `CREATE`/`DROP` at runtime; migrations use a separate role; revoke `UPDATE/DELETE` on `stock_ledger` and `online_order_status_history`.
4. **Secrets**: managed secret store, rotation runbook, key versioning for `ENCRYPTION_KEY`.
5. **Abuse protection**: rate limits, OTP lockout, bot protection on register/OTP.
6. **Privacy**: PII minimisation, log scrubbing, data-subject export/delete, retention schedule.
7. **Monitoring**: alert on webhook signature failures, repeated login failures, refund failures, cron failures.
8. **Testing**: automated tests for cross-tenant access, IDOR, state machine, payment idempotency, webhook replay.

---

## 11. Key end-to-end workflows

### 11.1 Prepaid order
`Customer cart → checkout (server prices, stock hold 30 min) → Razorpay order → customer pays → webhook payment.captured → payment: pending→paid → merchant confirms → allocates → packs → ships (AWB) → courier webhooks → out_for_delivery → delivered.` Holds become `converted` at confirm. Ledger posting is the missing step (D-9).
Failure branches: payment not completed in 30 min → auto-cancel, stock released; payment failed → `payment_failed`, retry allowed.

### 11.2 Cash on delivery
`Checkout (COD allowed by settings) → order placed, stock held → merchant confirms (phone/ rules) → fulfil as above → payment marked paid on delivery.`
Gap: COD has no hold timeout or fraud control (see §12 R-6).

### 11.3 Cancellation
`Customer/merchant cancels before shipped → holds released → if paid, Razorpay refund (idempotent) → refund row recorded → payment: refunded.`

### 11.4 Return and refund (target)
`delivered → customer requests return (reason, photos) → merchant approves → reverse pickup → QC → restock to ledger → refund (full/partial) → order: returned → refunded.` Only states exist today.

### 11.5 Subscription
`Onboard → trial → buy plan/seats via Razorpay → verify signature → quota updated → weekly cron expires and e-mails → renewal restores LIVE.`

---

## 12. Design observations / technical debt

| ID | Observation | Recommendation |
|---|---|---|
| D-1 | Authorization, tenant resolution and error handling are re-implemented in each of ~180 handlers (3 different tenant helpers, ad-hoc cookie reading). | Introduce `withTenant`, `withStaff`, `withCustomer` wrappers. |
| D-2 | Legacy `ec_*` tables (`ecomTables.ts`) duplicate `online_*` and `customers`; `ecom/auth` and `storefront/auth` are two customer auth systems; `/api/ecom/*`, `/api/[company]/ecom/*`, `/api/tenant/[company]/*` and `/api/storefront/*` are four URL conventions. | Remove legacy; one customer auth (password **and** OTP) under one API prefix. |
| D-3 | `reservationCleanup.ts` updates `online_orders`/`inventory_reservations` directly (also filters `payment_method IN ('online','prepaid','razorpay')`, values that the check constraint never allows). History is not written and the state machine is bypassed. | Route through `transitionOrderStatus` with actor `system:auto_cancel`; fix the predicate to `<> 'cod'`. |
| D-4 | `ensureDB()` runs DDL for every tenant on startup, and `ecom_available_stock` view is replaced each time. | Versioned migrations (e.g., a `schema_migrations` table), applied by a deploy job. |
| D-5 | Mixed money types: `NUMERIC(12,2)` and `INT` paise in platform tables; JS `Number` used in checkout while `decimal.js` is a dependency. | Use `Decimal` (or integer paise) in all money maths. |
| D-6 | Stray files in repo root (`output.html`, `scratch*`, `next.config.ts.bak`, `.xlsx` templates, `tsconfig.tsbuildinfo` tracked). | Clean up and ignore. |
| D-7 | `ecom_available_stock` counts unexpired `held` **and all `converted`** reservations forever. If a ledger deduction is later added (D-9), stock will be deducted twice. | Decide one rule: converted holds stop counting once the ledger entry exists. Add a test. |
| D-9 | **Online sales never reach the stock ledger.** A search of the allocate/ship/mark-delivered routes and the state machine finds no ledger, layer or FIFO posting (`postSalesToLedger` / `allocateSalesStockFIFO` are used by POS only). Online stock is reduced only through reservation rows, so the stock-ledger report, valuation, COGS and POS stock disagree with online. | Post an `online_sale` ledger entry (FIFO layers) at ship or deliver, and mark the reservation `fulfilled`. |
| D-10 | **Stock leak on cancel.** `confirmed` turns holds into `converted`, but `cancelled` releases only `held` rows. Cancelling a confirmed/packed order therefore leaves the stock permanently reserved. Also no stock restock path on `returned` (only a log line). | On cancel, release `held` **and** `converted`; on return/QC, restock via ledger. |
| D-11 | Checkout does not enforce serviceability (no `serviceable_*` / pincode check found) or coupon usage limits. | Enforce in checkout and in coupon validation. |
| D-8 | Docs/comments reference other repos' paths (`template_tailwind`, `digistorii`). | Remove. |

---

## 13. Open questions for the product owner
1. Deployment target: VM/container (keep custom server + Socket.IO) or Vercel serverless?
2. SMS/WhatsApp provider for OTP and order updates (MSG91, Gupshup, Twilio, Meta Cloud)? Cost per tenant?
3. Is COD in scope for launch, and with which limits (max value, pincode allow-list, prepaid-only for new customers)?
4. Courier aggregator(s) to integrate first (Shiprocket, Delhivery, Shipway…)?
5. Return window and refund policy defaults (7 days?), and who bears reverse shipping?
6. Tax invoice rules: single series per tenant? Credit notes for returns? E-invoicing threshold?
7. Do tenants need multiple storefronts / multi-vendor? (Affects tenancy model.)
8. Data-residency, retention and DPDP obligations?
9. Expected scale (tenants, orders/day) to size schema-per-tenant vs row-level tenancy.

---

## 14. Suggested acceptance criteria for "ready to go live"
1. S-1 to S-6 closed and covered by automated tests (cross-tenant access, IDOR, unauthenticated API sweep).
2. Credentials rotated; no secrets in git history.
3. Prepaid, COD, cancel+refund and webhook-replay flows pass an end-to-end test in staging with Razorpay test keys.
4. OTP delivered through a real provider with rate limits.
5. Backups verified by a restore drill; error monitoring and webhook-failure alerts live.
6. Terms, privacy and return policy pages published; invoice PDF with GST generated.

---

## Appendix A — Route inventory (grouped)
- **Auth**: `/api/auth/{login,logout,current-user,forgot-password,reset-password}`, `/api/admin/{login,current-user,users,billing/*}`, `/api/ecom/auth/{login,logout,me,register}`, `/api/storefront/auth/{send-otp,verify-otp,me}`.
- **Tenant/Platform**: `/api/resolve-tenant`, `/api/onboarding*`, `/api/guided-setup`, `/api/setup`, `/api/plans`, `/api/company*`, `/api/internal/cron/*`.
- **Masters/Catalogue**: categories, colors, materials, fittings, currencies, currency-rate, payment-mode/terms, despatch-terms, locations, locators, products(+import/template), product-variants, product-lookup, barcode-scan, pricing(+upload/template), discounts(+validate/active), image-master(+v2).
- **Procurement/Inventory**: purchase, purchase-orders, purchase-approval, grn, purchase-returns, opening-stock, stock-adjustments, reports/stock-ledger, po-attachments.
- **Sales/POS**: sales, sales-returns, bills, customers, create-order, send-otp.
- **E-commerce**: `/api/[company]/ecom/{checkout,orders,orders/[orderId]/{confirm,allocate,pack,ship,mark-delivered,cancel},payment/verify,webhooks/{razorpay,delivery/[partner]}}`, `/api/ecom/customer/{addresses,orders}`, `/api/tenant/[company]/{cart,wishlist}`, `/api/storefront/[company]/theme`, `/api/company/{ecom-settings,ecom-theme,ecom-products}`.
- **Cross-cutting**: notifications(+unread-count, read), dashboard/*, user-settings.

## Appendix B — Environment variables
`DATABASE_URL` (or `PG_*`), `JWT_SECRET`, `ENCRYPTION_KEY` (32 bytes base64, required by `cryptoHelper`; **not present in `.env.local`**, so saving or reading gateway/courier secrets will throw until it is set), `CRON_SECRET`, `ENABLE_CRON`, `RESERVATION_TIMEOUT_MINUTES`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `NEXT_PUBLIC_RAZORPAY_KEY_ID`, `BLOB_READ_WRITE_TOKEN`, `BLOB_STORE_ID`, `SMTP_HOST/PORT/SECURE/USER/PASS`, `NEXT_PUBLIC_APP_URL`, `PORT`.
