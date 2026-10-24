# Digistorii E-Commerce and Retail Platform - Feature Specifications

## 1. System Overview and Business Concept

Digistorii is an integrated multi-tenant retail enterprise and e-commerce platform designed to unify physical store operations (POS) and digital online sales under a single operational core. The system bridges brick-and-mortar stores with modern digital storefronts by maintaining centralized inventory, unified product catalogs, centralized order fulfillment, and multi-location warehouse management.

- Business Model: Multi-tenant Software-as-a-Service (SaaS) providing dedicated brand isolation, custom domain support, and tiered subscriptions for retail businesses.
- Unified Commerce: Enables merchants to sell simultaneously through in-store point-of-sale terminals and branded online storefronts while sharing inventory pools, tax structures, and customer records.
- Operational Transparency: Provides end-to-end auditability across stock movements, order lifecycle updates, purchase approvals, and cash transactions.

## 2. User Roles and Responsibility Matrix

Digistorii enforces a role-based access control framework with configurable responsibility profiles to align system capabilities with business hierarchy:

- Administrator: Full organizational access across configuration, user management, billing, financial settings, and master records.
- Site Handler: Focused on digital storefront management, theme customization, banner design, and online product catalog publication.
- Inventory Manager: Manages warehouses, locators, stock layers, stock adjustments, opening stock registers, and low-stock alerts.
- Purchasing Agent: Manages supplier directories, generates purchase orders, and initiates goods receipt notes and purchase returns.
- Sales Manager: Oversees POS billing counters, sales returns, price policies, discounts, and customer credit terms.
- Sales Person / Cashier: Operates the point-of-sale terminal, conducts barcode scanning, creates bills, and processes payments.
- Accountant: Accesses financial summaries, tax audit records, sales ledgers, purchase reports, and stock valuation summaries.
- Online Customer: End-user interacting with the digital storefront to browse products, manage addresses, place orders, and track deliveries.

## 3. Master Data and Catalog Management

The platform establishes centralized business masters that feed both offline POS billing and online e-commerce listings:

- Product and Variant Master: Supports parent products with multiple variant dimensions including SKU, barcode, size, color, material, fitting, and unit of measurement (UOM).
- Product Pricing and Overrides: Configurable standard pricing, retail prices, and dedicated online price overrides allowing distinct storefront pricing strategies.
- Taxation Engine: Multi-rate GST tax masters with automatic breakdown into CGST, SGST, and IGST based on location jurisdictions.
- Promotional Discounts: Flexible promotion rules configurable by fixed amount or percentage, with channel-specific restrictions (POS only, E-Commerce only, or Both).
- Digital Asset Master: Centralized media library managing high-resolution product photography, storefront banners, and promotional artwork.
- Operational Masters: System directories for currencies, payment modes, payment terms, and despatch terms.

## 4. Inventory and Warehouse Operations

Digistorii manages inventory with accounting-grade precision and real-time synchronization between sales channels:

- Multi-Warehouse Architecture: Hierarchical inventory tracking across regional warehouses, retail branch locations, and specific shelf locators.
- Immutable Stock Ledger: All inventory adjustments, receipts, and sales post immutable ledger entries guarded against historical tampering.
- Real-Time Stock Reservation: Holding temporary stock reservations during checkout sessions to prevent overselling of high-demand items.
- Stock Adjustments and Opening Balances: Controlled workflows for onboarding opening inventory and recording discrepancies, damage, or stock takes with audit reasoning.
- Low-Stock Monitoring: Configurable minimum stock thresholds per variant that trigger dashboard warnings and notifications when inventory reaches critical levels.

## 5. Procurement and Approval Workflow

The procurement module governs supplier relationships and inbound stock replenishment with strict internal controls:

- Supplier Management: Comprehensive supplier profiles including GSTIN, contact details, payment terms, currency preferences, and active trade status.
- Purchase Order (PO) Creation: Line-item purchase orders specifying variant quantities, unit rates, negotiated discounts, and applicable taxes.
- Multi-Level Purchase Approval Workflow:
  - Draft PO: Purchase orders initiated by purchasing staff remain in pending status.
  - Review and Verification: Authorized managers inspect order totals, item specifications, and vendor terms.
  - Approval / Rejection Decision: Approvers can formally approve the order or reject it with mandatory reason documentation.
- Goods Receipt Note (GRN): Inward stock inspection against approved purchase orders, verifying received quantities before updating warehouse stock ledger balances.
- Purchase Returns: Reversal mechanism for defective or rejected inbound goods with debit tracking against suppliers.

## 6. Point-of-Sale (POS) and Offline Sales

A fast-paced billing environment tailored for physical counter operations:

- Rapid Billing Interface: High-speed counter interface supporting keyboard shortcuts, rapid customer lookup, and barcode scanner input.
- Flexible Payment Tender: Supports cash, card, UPI, credit, and split-tender payment allocations against sales invoices.
- Invoice Generation: Automatic calculation of line discounts, item taxes, invoice totals, and generation of standard thermal receipts.
- Counter Sales Returns: Integrated return workflow linking back to original sales receipts, handling restocking and customer refunds.

## 7. Digital Storefront and Customer Experience

A branded, responsive shopping interface empowering retail brands to sell directly to consumers:

- Dynamic Theme Customizer: Visual design studio allowing administrators to configure brand colors, typography, header navigation, hero banners, and promotional sections.
- Draft vs. Published Previews: Version-controlled storefront layouts allowing merchants to prepare seasonal campaigns in draft mode before publishing live.
- Customer Authentication: Secure customer access supporting mobile OTP login, profile registration, and account recovery.
- Customer Account Portal: Self-service customer dashboard for managing saved delivery addresses, viewing order histories, and monitoring order tracking details.
- Cart and Wishlist: Persistent shopping carts and wishlist collections with automatic stock availability validation and price calculations.
- Checkout Engine: Multi-step checkout with address selection, serviceable pincode checks, dynamic shipping fee calculation, and free-delivery threshold enforcement.
- Payment Gateway Integration: Seamless payment options including Razorpay online checkout (cards, UPI, net banking) and Cash on Delivery (COD).

## 8. E-Commerce Order Fulfillment and State Transitions

Digistorii enforces a multi-dimensional state machine ensuring synchronization across orders, payments, and logistics:

- Order Status Lifecycle:
  - Placed: Order created by customer with payment authorization or COD verification.
  - Confirmed: Merchant validates order and verifies stock reservations.
  - Packed: Warehouse staff complete physical picking and secure parcel packaging.
  - Shipped: Parcel handed over to courier partner with generated tracking credentials.
  - Out for Delivery: Courier initiates final-mile delivery attempt.
  - Delivered: Customer confirms parcel receipt; order reaches terminal completion.
  - Cancelled: Permitted before shipment; automatically releases inventory reservations and initiates refunds for prepaid orders.
  - Returned / Refunded: Post-delivery return workflow handling reverse pickup and financial settlement.
- Payment Status Transitions:
  - Pending: Order initiated awaiting payment confirmation.
  - Authorized / Paid: Gateway webhook verifies successful funds capture.
  - Failed: Unsuccessful payment transaction, allowing checkout retry.
  - Refunded / Partial: Financial reimbursement processed via gateway upon order cancellation or item return.
- Delivery Status Transitions:
  - Not Shipped: Default pre-shipment state.
  - Picked Up: Logistics partner collects shipment from warehouse.
  - In Transit: Parcel in motion through logistics network.
  - Out for Delivery: Final delivery route in progress.
  - Delivered: Successful package handover to customer.
  - Failed Delivery / Return to Origin (RTO): Automated handling for undelivered packages initiating return to warehouse.
- Fulfillment Picking and Allocation: Line-item allocation tracking individual product readiness (Pending, Allocated, Fulfilled) before parcel sealing.
- Logistics and AWB Management: Integration with courier partners providing automated Air Waybill (AWB) number assignment and direct tracking links.
- Audit Trail: Immutable chronological log tracking every status transition, action timestamp, and user identifier.

## 9. Platform Administration and SaaS Management

Multi-tenant administration and subscription controls enabling scalable management:

- Tenant Onboarding Wizard: Step-by-step guided setup for newly onboarded businesses to configure company details, tax identifiers, and initial stores.
- Custom Domain Management: Native support for brand-specific subdomains and custom apex/sub-level domains with verification status.
- Subscription Tiers: Flexible subscription plans (Instore, Ecom, Basic, Growth, Enterprise) defining quotas for active user seats, warehouse limits, and store locations.
- Seat Expansion and Billing: Self-service seat upgrade workflows with online payment processing and real-time quota adjustments.
- System Notifications: Internal notification hub for operations alerts, low-stock warnings, and transaction notices.

## 10. Future Works

Planned enhancements designed to further expand platform automation, customer engagement, and omnichannel capabilities:

- Customer Communication Automation: Direct WhatsApp and SMS notifications for order confirmations, live dispatch updates, and delivery confirmations.
- Abandoned Cart Recovery: Automated reminder sequences via email and WhatsApp targeting customers who abandon checkout sessions.
- Social Proof and Reviews: User-generated product reviews, star ratings, and photo testimonials integrated into product detail pages.
- Advanced Inventory Alerts: Customer-facing back-in-stock alert notifications and automated restock triggers for procurement teams.
- Omnichannel Loyalty and Store Pickup: Unified customer reward points redeemable across both POS counters and online storefronts, alongside Click-and-Collect in-store pickup options.
- Intelligent Search and Recommendations: AI-driven product recommendations, semantic product search, and autocomplete suggestions on storefronts.
- Demand Forecasting and Route Optimization: Machine learning predictive stock ordering based on seasonal sales velocity, combined with local delivery route optimization.
- Progressive Web App and Mobile Client: Offline-capable PWA storefront and native merchant companion mobile application for inventory scanning and order processing on the go.
