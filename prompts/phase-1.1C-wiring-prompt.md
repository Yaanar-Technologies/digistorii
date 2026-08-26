# Phase 1.3 — Public Routing, Customer Auth, Product Wiring & Checkout

Builds on: `src/components/storefront/` (1.1A components + fixture data)
and the theme editor (1.2, publishes to `storefront_config.published_theme`).
This phase wires everything to real data and makes the storefront live at
its public route. No more fixtures for anything covered here.

**Do not** touch the theme editor UI itself, or re-litigate the
`StorefrontTheme` shape — that's settled from 1.1A/1.2. This phase only
wires: routing, product data, customer auth, cart, and checkout.

## 1. Public routing

- Storefront lives at `/${company}/store` (matches the "Open Live
  Storefront" link already wired in the theme editor).
- Use Next.js **server components / route handlers** for product data —
  no client-side `apiFetch` calls for the product grid or PDP. Pages
  render server-side with data already joined and normalized into the
  `StorefrontProduct` shape from 1.1A.
- Route structure (propose exact segment names, but functionally):
  storefront home (hero + category grid), category listing (product grid
  + filters), product detail, cart, wishlist, sign-in/OTP, checkout
  (address → payment → review → place order).
- Theme: server-fetch `published_theme` from `storefront_config` for the
  live site. Preview mode (draft) stays inside the editor from 1.2 — don't
  build a second public preview route unless one already exists; flag it
  to me if you find one's expected.

## 2. Product data wiring

Implement the server-side join described in 1.1A, don't let components
touch the DB directly:

```
storefront_products (is_live = true)
  → product_variants
    → product_pricing.final_selling_price
    → ecom_price_overrides.ecom_price (if active, takes precedence)
  → ecom_available_stock.available_qty
```

Assemble into `StorefrontProduct[]` server-side, pass down as props. Keep
the stock rule from 1.1A exactly as specified: **show all live variants,
badge "Out of stock" when `available_qty <= 0`, disable (don't hide)
add-to-cart** — this was explicit in 1.1A, don't let it drift back to a
filter.

Category grid / filters (category, price range, in-stock) also run
server-side — filters become query params, not client-side array
filtering.

## 3. Customer identity — OTP sign-in

Reuse the existing OTP provider/util already in the app (point me to its
current usage — e.g. which route or module — if it's not obvious from the
codebase, and I'll confirm before wiring it in rather than guessing at its
interface).

Two explicit requirements:
- This is `customer_ecom_auth` — a **separate identity/session** from
  tenant-user auth (`useUser`/`CurrentUserContext` used in the editor).
  Don't reuse that context or session cookie for storefront customers.
- Sign-in page (already scaffolded in 1.1A) gets real behavior: enter
  phone/email → request OTP via the existing provider → verify → establish
  customer session. Session should be checked at checkout (cart can stay
  guest-accessible; address/payment/place-order should require it — flag
  me if you'd rather gate earlier).

## 4. Cart

- Cart drawer/page (scaffolded in 1.1A) becomes stateful — persist cart
  server-side keyed to the customer session (or a guest/anon token if you
  support guest carts; default to requiring sign-in before cart persists
  server-side, since OTP is being wired this same phase — flag if you'd
  rather do local-storage-free guest carts some other way).
- Stock is (re-)checked at add-to-cart and at checkout, per the Phase 0
  decision already referenced in 1.1A — not at listing.

## 5. Checkout flow — real behavior

The four steps scaffolded in 1.1A (address → payment → review → place
order) get wired:

- **Address**: create/select a saved address for the customer.
- **Payment**: integrate **Razorpay in test mode** — use whatever
  Razorpay test credentials/config already exist in the project; don't
  hardcode new keys into component code. Payment method selection should
  create a Razorpay order and handle the client-side checkout handoff
  (standard Razorpay Checkout flow), then confirm/verify the payment
  server-side before treating the order as placed.
- **Review**: show line items with `effectivePrice`, address, and payment
  method before confirming.
- **Place order**: on confirmed payment, create the order record, clear
  the cart, and redirect to an order-confirmation state. If Razorpay
  confirmation fails, surface a clear retry path — don't silently drop the
  cart.

## 6. Out of scope for this phase

- Order management / fulfillment dashboard (tenant-side).
- Refunds, cancellations, or post-purchase flows.
- Wishlist persistence beyond basic add/remove-and-list (no
  recommendations, no sharing).
- Switching Razorpay out of test mode — that's a config/business decision
  for later, not a code change to make here.

## 7. When done, tell me

- Final public route structure.
- Which existing OTP provider/module you wired in, and its interface.
- Confirmation that guest-vs-signed-in cart behavior matches §4, or what
  you changed and why.
- Any place the Razorpay test-mode flow needed a decision I didn't specify
  (e.g. webhook vs. client-confirm verification) — tell me which you
  chose.
