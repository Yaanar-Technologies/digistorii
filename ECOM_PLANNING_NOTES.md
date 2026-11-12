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
  - ✅ Company-wise (multi-tenant) routing
  - ✅ Ecom settings and config pages (payment mode, gateway, courier, policies, serviceable area, shipping)
  - ✅ Storefront theme settings with draft and published versions
  - ✅ Block storefront and checkout when the tenant's subscription is expired (S-12) (Tiered lifecycle: 7-day warning, 3-day grace period, hard cutoff /store-suspended, 403 STORE_INACTIVE checkout guard)
  - ✅ Reserve company slugs (`api`, `admin`, `store`, `setup` ...) (Zod validation schema + DB check constraint + onboarding guards)
  - ✅ Store policies pages (terms, privacy, returns) (SSR dynamic route `/[company]/policies/[type]`, fallback UI, and footer links)
- Pending (in already started items)
  - None
- Yet to Cover
  - None

## Phase 2: Storefront and Template

- Covered
  - Storefront template design
  - Home page sections
  - Header, footer, theme
  - Mobile responsiveness review (header mobile drawer, cart drawer safe margins, product detail responsive grid)
  - SEO tags per page (meta, Open Graph, dynamic sitemap.xml, robots.txt, schema.org JSON-LD structured data for OnlineStore and Product)
  - Banner and promo scheduling (start and end date on hero slides and special deals with pure evaluation utility)
- Pending (in already started items)
  - None
- Yet to Cover
  - None

## Phase 3: Product and Catalogue Management

- Covered
  - Product listing and categories
  - Colors, materials, images APIs
  - Offers and discounts APIs (with pos / ecom / both channel and coupon code)
  - E-commerce price override per variant
  - Product detail page polish (responsive gallery lightbox, star ratings, specs breakdown, shipping/returns policy)
  - Filters, sorting, pagination (server-side pagination in the API with limit/offset and total_count, min/max price, in-stock, and sort filters)
  - Out-of-stock display and back-in-stock handling (distinct out of stock status, back_in_stock_subscriptions table and alert signup API + UI)
  - Related products (related products API based on category/material + You May Also Like responsive grid)
  - Product reviews and ratings (product_reviews table in tenant schema, GET & POST reviews API with statistics and distribution, interactive Write Review UI)
- Pending (in already started items)
  - None
- Yet to Cover
  - None 

## Phase 4: Cart and Checkout

- Covered
  - Cart and wishlist APIs, guest-to-account merge
  - Checkout page and API with server-side pricing
  - Coupon validation at checkout (percentage or fixed; all items or chosen variants)
  - Shipping fee and free-delivery threshold
  - Idempotent checkout (resumes an unpaid order)
  - Stock reservation with auto release after 30 minutes
  - Address selection and validation with strict customer ownership check (403 INVALID_ADDRESS_OWNERSHIP) (S-3)
  - Serviceability check by country, state, pincode at checkout against ecom_settings (D-11)
  - Coupon usage limits (total usage limit, per-customer limit) and minimum order value (MOV) with atomic count increments
  - Concurrency & stock row locking with deterministic pessimistic locks (FOR UPDATE on product_variants & current_stock)
  - Friction-free authenticated guest checkout via Phone OTP (send-otp, verify-otp, auto-merging cart)
- Pending (in already started items)
  - None
- Yet to Cover
  - Abandoned cart reminders (needs working e-mail/SMS worker first)

## Phase 5: Order Placement and Order Management

- Covered
  - Order API and customer orders API
  - Order status flow: placed, confirmed, packed, shipped, out for delivery, delivered, cancelled, returned, refunded (plus payment_failed)
  - Three separate status tracks: order, payment, delivery, each with allowed transitions
  - Status change rules and audit log (`online_order_status_history`)
  - Admin actions: confirm, allocate, pack, ship, mark delivered, cancel
  - Per-line fulfilment status
  - System auto-cancel uses the state machine so history is written (D-3)
  - Customer cancellation window (self-service until packed/shipped)
  - Order notes and internal comments (`order_notes` table, API, and `OrderInternalNotes` component)
  - Customer-facing order timeline from the status history (`CustomerOrderTimeline` milestone stepper)
- Pending (in already started items)
  - Order placement flow end to end test (prepaid, COD, cancel, refund)
  - Admin order filters and search (list is basic)
- Yet to Cover
  - Order confirmation by email and SMS

## Phase 5B: Stock and ledger integration (Completed)

- Covered
  - Post online sales to the stock ledger and FIFO layers at ship or delivery (D-9). Physical counts, valuation, and POS stock match online sales.
  - Release `converted` reservations when a confirmed order is cancelled; stock is unlocked immediately (D-10).
  - Atomically transition converted reservations to `consumed` on stock ledger debit posting, eliminating double deductions (D-7).
  - Restock on return after QC (`postReturnRestockToLedger`), writing ledger credit and restoring FIFO layer with reason code.
  - Warehouse choice rule for each order (`warehouseRouter.ts` supporting nearest pincode, stock availability, and default fulfillment hub).
  - Low-stock alert tied to online reservations and reorder level thresholds.
- Yet to Cover
  - None (All core Phase 5B requirements implemented)

## Phase 6: Delivery and Logistics

- Covered
  - Delivery record per order (courier, AWB, tracking URL, timestamps, label URL, dispatched date)
  - Delivery webhook receiver with signature check, multi-attempt NDR handling, and RTO progression
  - Proof of delivery (POD) capture (signature, photo, OTP, recipient name, coordinates)
  - Delivery zones and pincode serviceability (`shipping_zones`, `shipping_zone_pincodes`)
  - Tiered shipping rates by zone, weight, order value (`shipping_rate_rules`, `lib/shippingCalculator.ts`) integrated into checkout
  - Estimated delivery date calculation and customer delivery windows
  - Outbound courier adapter library (`CourierAdapter` interface, `ShiprocketAdapter`, `SelfAdapter`) with `createShipment`, `cancelShipment`, `generateReturnPickup`
  - Automated & manual delivery partner assignment on order dispatch
  - Customer real-time tracking route (`app/[company]/track/[orderIdOrAwb]/page.tsx`) and timeline component (`CustomerTrackingTimeline.tsx`)
  - Delivery exception lifecycle (NDR retry limit, auto-transition to `RTO`, warehouse restock alerts)
  - Reverse logistics engine (`order_returns` data model, customer/admin return request API `orders/[orderId]/return`)
  - Reverse courier pickup scheduling API (`orders/[orderId]/return-pickup`)
  - Restock QC inspection and automated refund pipeline (`orders/[orderId]/process-refund`, stock ledger FIFO credit via `postReturnRestockToLedger`, Razorpay gateway/credit refund)
  - Admin reverse logistics toolbar (`AdminReturnApprovalCard.tsx`) integrated into order details view
- Pending (in already started items)
  - None
- Yet to Cover
  - None (All core Phase 6 delivery, logistics & reverse logistics requirements implemented)

## Phase 7: Payments and Invoicing

- Covered
  - Razorpay order creation with each tenant's own encrypted credentials
  - Inbound webhook primacy architecture: signed raw-body webhook handler (`app/api/[company]/ecom/webhooks/razorpay/route.ts`) as single source of truth for transitioning `payment_status` to `'paid'`
  - Read-only client payment verify handshake (`app/api/[company]/ecom/payment/verify/route.ts`) with mathematical HMAC signature verification and polling status
  - Strict webhook idempotency deduplication with `payment_webhook_events`
  - Payment gateway multi-mode controls (`payment_gateway_configs`: live vs test mode credentials, webhook secrets)
  - Cash on Delivery (COD) anti-fraud and risk validation engine (`lib/payments/codValidator.ts`: maximum order value limit, pincode serviceability allowlist, phone verification)
  - Payment failure and pending recovery retry route (`app/[company]/(store)/checkout/payment-retry/[orderId]/page.tsx`) with 30-min stock reservation countdown timer and gateway re-invocation (`api/[company]/ecom/orders/[orderId]/retry-payment`)
  - Partial and full refund execution service (`lib/payments/refundService.ts`) with automatic error fallback logging to `payment_refunds`
  - Admin operational critical alert pipeline (`admin_operational_alerts`, `AdminOperationalAlertsBanner.tsx`, `api/[company]/ecom/operational-alerts`) for gateway refund or webhook failures
  - Statutory GST compliance engine (`lib/tax/gstCalculator.ts`: intra-state CGST+SGST split vs inter-state IGST, HSN rates, Indian words amount conversion)
  - Concurrency-safe sequential tax invoice numbering (`INV/{FY}/{00000X}`) and credit note numbering (`CN/{FY}/{00000X}`)
  - Statutory tax invoice data model (`tax_invoices`), automated generation on payment capture, and printable GST Tax Invoice HTML view (`api/[company]/ecom/orders/[orderId]/invoice`)
  - Statutory GST credit note generation (`credit_notes`) integrated into reverse logistics return approval & QC restock pipeline
- Pending (in already started items)
  - None
- Yet to Cover
  - None (All core Phase 7 payments, invoicing, GST compliance & financial audit integrity requirements implemented)

## Phase 8: Customer Account and Support

- Covered
  - Customer register, login, logout consolidated under canonical multi-tenant API `/api/[company]/storefront/auth/` (Resolved Tech Debt D-2)
  - Passwordless phone OTP authentication (`send-otp` & `verify-otp`) with rate limiting and secure session issuance
  - Storefront customer password reset token workflow (`forgot-password` & `reset-password`)
  - Dedicated responsive account portal layout (`app/[company]/(store)/account/layout.tsx`) with sidebar navigation, profile summary badge & session sign-out
  - Account Overview & Profile Dashboard (`app/[company]/(store)/account/page.tsx`) with quick stats, recent orders preview, and default address cards
  - Orders Management & Order History listing (`app/[company]/(store)/account/orders/page.tsx`) with status filters, GST tax invoice download & 1-click reorder
  - Order Detail & Status Tracker (`app/[company]/(store)/account/orders/[id]/page.tsx`) with visual stepper, live AWB tracking reference, self-service cancellation for unfulfilled orders, and self-service return/exchange modal for delivered orders
  - Address Book UI & full CRUD API (`app/[company]/(store)/account/addresses/page.tsx` & `/api/[company]/ecom/customer/addresses`) with default shipping/billing toggles and Indian PIN code validation
  - Customer Help & Support Portal (`app/[company]/(store)/account/support/page.tsx`) with dynamic categorized FAQ accordion and support ticket submission logging to `ecom_support_tickets`
  - Privacy, Notification Preferences & Data Export (`app/[company]/(store)/account/settings/page.tsx`) with WhatsApp/SMS/Email toggles, GDPR/DPDP personal data export (JSON download), and soft account deletion with PII anonymization

- Pending (in already started items)
  - None


- Yet to Cover
  - None (All Phase 8 Customer Account and Support requirements fully implemented)






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


## Implementation Addendum: Store Sub-End Phases A, B, and C

### Phase A: End-to-End Real-Time Payment Webhook & Reconciliation
- Implemented AES-256-GCM symmetric encryption utility with IV prepending and auth tag integrity (`src/lib/crypto.ts`).
- Created tenant payment gateway credentials table `tenant_payment_gateways` and tenant payment transaction ledger `ecom_payment_transactions` (`src/lib/paymentsSchema.ts`, `src/lib/init-db.ts`).
- Upgraded Admin Payment Settings (`src/app/[company]/(admin)/admin/settings/payments/page.tsx`, `/api/[company]/admin/settings/payment-gateways/route.ts`) with masked secret keys, mode toggling (sandbox/live), and webhook secret storage.
- Standardized Storefront dynamic gateway resolution (`/api/[company]/ecom/payment/razorpay/initiate/route.ts`) returning decrypted tenant `key_id` without exposing secret credentials.
- Hardened Razorpay webhook listener (`/api/[company]/ecom/webhooks/razorpay/route.ts`) verifying SHA256 HMAC signatures with idempotency safeguards, updating `order_payments` and transitioning order state to `paid`.

### Phase B: Automated Fulfillment & Logistics Webhooks
- Standardized Courier Adapter contract (`CourierAdapter` in `src/lib/couriers/types.ts`) with normalized responses for shipment creation, label generation, cancellation, rate calculation, and serviceability checks.
- Implemented adapters for Shiprocket (`ShiprocketAdapter` in `src/lib/couriers/shiprocketAdapter.ts`), Delhivery (`DelhiveryAdapter` in `src/lib/couriers/delhiveryAdapter.ts`), and Self-delivery (`SelfAdapter` in `src/lib/couriers/selfAdapter.ts`).
- Developed zero-touch order fulfillment orchestrator (`src/lib/fulfillment/autoFulfill.ts`) with automated retry logic, tracking URL generation, and error fallback to manual fulfillment state (`manual_fulfillment_required`).
- Wired automatic fulfillment triggers into both Razorpay webhook handler (`payment.captured`) and COD checkout flow (`src/app/api/[company]/ecom/checkout/route.ts`).
- Created unified courier delivery webhook endpoint (`/api/[company]/ecom/webhooks/delivery/[partner]/route.ts`) updating `orders`, `shipments`, and `order_tracking_events` with proof-of-delivery notes and automated stock restocking upon return delivery.

### Phase C: Tenant Custom Domain Architecture & Local Multi-Tenancy
- Created `tenant_domains` database model with unique domain index (`LOWER(domain)`) supporting custom domains and verification status tracking (`src/lib/init-db.ts`).
- Developed tenant domain resolver utility (`src/lib/tenant/resolveDomain.ts`) supporting platform roots (`testdigistorii.workpro.cloud`, `workpro.cloud`, `digistorii.com`, `localhost:3000`), platform subdomains (`<tenant>.testdigistorii.workpro.cloud`, `<tenant>.localhost:3000`), and apex/sub-level merchant custom domains (`tanviboutique.com`) with 60-second in-memory TTL caching.
- Enhanced Next.js Edge Middleware (`src/middleware.ts`) to transparently rewrite custom domains and platform subdomains to internal `/[company]/store` routes while preserving search query parameters (`nextUrl.search`) and leaving client-facing browser URLs clean.
- Provided production Nginx reverse proxy configuration and Hostinger deployment guide supporting wildcard subdomains, custom CNAME mapping, and SSL termination.
