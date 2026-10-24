# Digistori-Ecom: Ecommerce Website Planning Notes

Scope: Ecommerce website only. POS billing is complete and excluded.
Full requirements and security findings: see `SRS.md` (IDs like S-1, D-9 refer to it).

Legend: ✅ done · 🟡 partly done · ⬜ not started · 🔴 blocker for go-live

> **Revision note (2026-10-23).** Statuses below were re-checked against the code, not inferred from folder names.
> Many items that were "Yet to Cover" are now built (order state machine, status history, shipping fee, free-delivery
> threshold, COD, webhook signature checks, refund on cancel, coupons). New phases were added for **security**
> (Phase 0) and **stock/ledger integration** (Phase 5B), because the review found problems there that block launch.
> Items added by this review are tagged **(new)**.

## Phase 0: Security and tenant isolation (new) 🔴 do this before any feature work

- Done in code (2026-10-24, branch `fix/signed-sessions`; not yet run against a live server)
  - 🟡 Auth guard on back-office APIs (S-1): middleware now covers `/api`; non-public routes need a signed staff session. Per-route permission checks (e.g. `purchase`, `sales`) are still to do.
  - ✅ Tenant from verified source only (S-2): middleware drops client `x-tenant`, `x-schema-name`, `x-company-id`, `x-user-name` and sets them from the session or the database.
  - ✅ Checkout uses the logged-in customer; address ownership checked; `payment/verify` checks order owner (S-3)
  - 🟡 `.env.local` removed from git index and `.env.example` added (S-4). **You still need to rotate every key and purge history** (`git filter-repo`).
  - ✅ Staff order actions need a valid session, company match and `ecommerce_access`; `x-user-name` ignored (S-6)
  - ✅ Socket.IO needs a signed staff cookie; room comes from the token; CORS restricted (S-7)
  - 🟡 `ENCRYPTION_KEY` generated locally (S-9). Merging `payment_gateway_configs` into `ecom_settings` is still open (secrets are already encrypted on save). Set the key on the production host too.
  - ✅ Onboarding: phone OTP removed; payment proven by Razorpay signature; only the email link can set `LIVE` (see skill `digistorii-onboarding`)
  - 🟡 Tests: `scripts/api-auth-sweep.mjs` written (run with the server up); IDOR and cross-tenant tests still to write
- Skipped on request
  - Remove OTP from the API response and add a real SMS provider (S-5): applies to storefront customer OTP (`storefront/auth/send-otp`) only; onboarding no longer uses phone OTP

## Phase 1: Core Setup and Settings

- Covered
  - Company-wise (multi-tenant) routing
  - Ecom settings and config pages (payment mode, gateway, courier, policies, serviceable area, shipping)
  - Storefront theme settings with draft and published versions
- Pending (in already started items)
  - Block storefront and checkout when the tenant's subscription is expired (S-12) (new)
  - Reserve company slugs (`api`, `admin`, `store`, `setup` ...) (new)
- Yet to Cover
  - Store policies pages (terms, privacy, returns). The text fields already exist in settings, so only the pages are missing.

## Phase 2: Storefront and Template

- Covered
  - Storefront template design
  - Home page sections
  - Header, footer, theme
- Pending (in already started items)
  - Mobile responsiveness review
  - SEO tags per page (meta, Open Graph, sitemap, product structured data)
- Yet to Cover
  - Blog or content pages
  - Banner and promo scheduling (start and end date on banners)

## Phase 3: Product and Catalogue Management

- Covered
  - Product listing and categories
  - Colors, materials, images APIs
  - Offers and discounts APIs (with pos / ecom / both channel and coupon code)
  - E-commerce price override per variant
- Pending (in already started items)
  - Product detail page polish
  - Filters, sorting, pagination (do pagination in the API, not in the browser)
- Yet to Cover
  - Out-of-stock display and back-in-stock handling (stock view exists; the UI and alerts do not)
  - Related products
  - Product reviews and ratings (move to Short Term in Future Ideas; needs moderation first)

## Phase 4: Cart and Checkout

- Covered
  - Cart and wishlist APIs, guest-to-account merge
  - Checkout page and API with server-side pricing
  - Coupon validation at checkout (percentage or fixed; all items or chosen variants)
  - Shipping fee and free-delivery threshold
  - Idempotent checkout (resumes an unpaid order)
  - Stock reservation with auto release after 30 minutes
- Pending (in already started items)
  - Address selection and validation (PIN format is checked; ownership of the address id is not) (S-3)
  - Serviceability check by country, state, pincode at checkout (settings exist, checkout ignores them) (D-11)
  - Coupon usage limits (per customer, total) and minimum order value (new)
  - Check stock row locking so two buyers cannot take the last unit (new)
- Yet to Cover
  - Guest checkout (decide: phone OTP at checkout is cheaper and safer than a true guest)
  - Abandoned cart reminders (needs working e-mail/SMS first)

## Phase 5: Order Placement and Order Management

- Covered
  - Order API and customer orders API
  - Order status flow: placed, confirmed, packed, shipped, out for delivery, delivered, cancelled, returned, refunded (plus payment_failed)
  - Three separate status tracks: order, payment, delivery, each with allowed transitions
  - Status change rules and audit log (`online_order_status_history`)
  - Admin actions: confirm, allocate, pack, ship, mark delivered, cancel
  - Per-line fulfilment status
- Pending (in already started items)
  - Order placement flow end to end test (prepaid, COD, cancel, refund)
  - Admin order filters and search (list is basic)
  - System auto-cancel must use the state machine so history is written (D-3) (new)
- Yet to Cover
  - Order confirmation by email and SMS
  - Customer cancellation window (for example: until packed)
  - Order notes and internal comments
  - Customer-facing order timeline from the status history (new)

## Phase 5B: Stock and ledger integration (new) 🔴

- Yet to Cover
  - 🔴 Post online sales to the stock ledger and FIFO layers at ship or delivery (D-9). Today only reservations change, so reports and POS stock do not match online sales.
  - 🔴 Release `converted` reservations when a confirmed order is cancelled; today this stock stays blocked forever (D-10)
  - Define when a converted reservation stops counting in available stock, so stock is not deducted twice (D-7)
  - Restock on return after QC (ledger entry), with a reason code
  - Warehouse choice rule for each order (nearest, default, or by stock)
  - Low-stock alert tied to online reservations

## Phase 6: Delivery and Logistics

- Covered
  - Delivery record per order (courier, AWB, tracking URL, timestamps)
  - Delivery webhook receiver with signature check
  - Flat shipping fee and free-delivery threshold
- Pending (in already started items)
  - Courier library groundwork: outbound API to create the shipment and get the AWB (only the inbound webhook exists)
- Yet to Cover
  - Delivery zones and pincode serviceability (data model first, then checkout)
  - Delivery charges by zone, weight, order value
  - Delivery partner assignment
  - Tracking page for customers
  - Delivery slot or estimated date
  - Proof of delivery (signature, photo, OTP)
  - Failed delivery handling
    - Retry attempts (limit, then move to RTO)
    - Return to origin
  - Returns and exchange pickup
  - Refund after return approval

## Phase 7: Payments and Invoicing

- Covered
  - Razorpay order creation with each tenant's own keys (encrypted)
  - Client payment verify with signature check
  - Webhook with raw-body signature check, idempotent handling
  - Payment status mapping to orders
  - Cash on delivery option
  - Full refund through Razorpay when a paid order is cancelled
- Pending (in already started items)
  - Pick one source of truth for "paid": the webhook. Keep the verify route as read-only status (new)
  - Payment gateway live setup per tenant (keys, webhook URL, test then live)
  - Failed and pending payment retry
  - COD controls: maximum order value, pincode allow-list, confirmation call or OTP (new)
- Yet to Cover
  - Partial refunds for item returns
  - Refund status page and refund failure alert to the admin
  - Invoice generation (PDF)
  - Tax and GST on invoice (CGST/SGST/IGST split; reuse POS tax logic), credit note for returns
  - Invoice email to customer

## Phase 8: Customer Account and Support

- Covered
  - Customer register, login, logout
  - OTP login (code generation, hash, expiry; delivery is still a demo)
  - Saved addresses API
- Pending (in already started items)
  - Account page: orders and profile
  - Merge the two customer login systems (`/api/ecom/auth` and `/api/storefront/auth`) into one (D-2) (new)
  - Password reset for storefront customers (new)
- Yet to Cover
  - Order history and reorder button
  - Return request from account
  - Contact or support form
  - FAQ page
  - Notification preferences and unsubscribe
  - Account deletion and data export (privacy law) (new)

## Phase 9: Admin Reports and Analytics

- Covered
  - Admin login and user management
  - Dashboard APIs (shared base)
- Pending (in already started items)
  - Split dashboard numbers by channel, POS and online (new)
- Yet to Cover
  - Online sales report
  - Orders by status report
  - Delivery performance report
  - Returns and refunds report
  - Top online products
  - Customer and coupon usage reports
  - Reconciliation report: gateway payments vs orders (new)

## Phase 10: Testing, Security and Deployment

- Covered
  - Webhook signature checks (payment and delivery)
  - Cron endpoints protected by secret
  - Secrets for gateway and courier are encrypted in settings
- Pending (in already started items)
  - Environment variable cleanup (also see Phase 0; `ENCRYPTION_KEY` is missing, `.env.local` is in git)
  - Decide the hosting target. The custom Node server (Socket.IO, node-cron) does not run on Vercel serverless, and the Vercel cron runs every 2 days while holds last 30 minutes (S-13)
- Yet to Cover
  - Order and payment flow testing (automated, with Razorpay test mode)
  - API rate limiting and OTP abuse protection
  - Input validation on all APIs (one schema library, for example zod)
  - Error logging and monitoring (stop logging SQL text and e-mails)
  - Backups and staging environment
  - Versioned database migrations instead of running DDL at startup (D-4)
  - Security headers (CSP, HSTS) and CSRF origin check
  - Performance and page speed audit
  - Go-live checklist (SRS section 14)

## Integration Ideas (POS)

- Stock sync
  - Online stock reads from POS stock
  - Reserve stock on order placement
  - Post online sales into the same ledger (see Phase 5B)
- Shared customers
  - One customer record across POS and online (already shared table, `channel` column)
- Shared catalogue
  - Same products, prices, offers
- Shared invoices and sales reports
- Store pickup
  - Order online, collect at POS store

## Technical Debt to Schedule (new)

- One API URL style instead of four (`/api/ecom`, `/api/[company]/ecom`, `/api/tenant/[company]`, `/api/storefront`)
- Remove legacy `ec_*` tables in `ecomTables.ts`
- Shared wrappers `withTenant / withStaff / withCustomer` instead of repeated checks in about 180 route files
- Use `Decimal` for all money maths in checkout (currently JS numbers)
- Replace `Math.random()` order numbers with a secure generator
- Delete stray files in repo root (`output.html`, `scratch*`, `.bak`, tracked `tsbuildinfo`)

## Future Ideas

- Short Term
  - Unified inventory between POS and online
  - WhatsApp order updates
  - Abandoned cart reminders
  - Product reviews and ratings (verified buyers only)
  - Back-in-stock alerts
  - Coupon and referral codes (coupon codes already work)
  - Store pickup (click and collect) - small effort once Phase 5B is done (moved up)
- Mid Term
  - Progressive Web App
  - Loyalty points shared across POS and online
  - Smart search with suggestions
  - Live delivery tracking on a map
  - AI product recommendations
  - WhatsApp ordering
  - Personalised offers
  - Courier aggregator integration (Shiprocket, Delhivery) with rate shopping (new)
  - Self-serve return portal with label creation (new)
  - Tenant-level data export and backup tool (new)
- Long Term
  - Voice or image based product search
  - Demand forecasting and auto reorder alerts
  - Dynamic pricing
  - Multi-store and multi-vendor support (decide early; it affects the tenancy model)
  - Native mobile app
  - Route optimisation for delivery
  - Move from schema-per-tenant to a sharded or hybrid model if tenant count grows past a few hundred (new)

## Suggested order of work

1. Phase 0 (security) and rotate keys
2. Phase 5B (stock ledger fix) and Phase 4 pending items
3. Phase 7 pending items (invoice PDF, COD controls) and Phase 5 notifications
4. Phase 6 (courier API, tracking) and returns/refunds
5. Phase 2/3 polish, SEO, reports, then Future Ideas
