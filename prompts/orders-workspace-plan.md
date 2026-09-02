Implement the ecom order placement workflow end-to-end using the existing 
schema, wiring inventory_reservations, stock_ledger, stock_layers, and 
sales_allocations correctly rather than bypassing them.

PRE-REQUISITE — confirm before starting:
- Inspect the current POS sale-transaction code path and determine whether 
  stock deduction writes to `stock_ledger`/`stock_layers` or directly to 
  the legacy `inventory.current_stock` column. Ecom MUST deduct from the 
  same source POS uses, or stock will desync between channels. Report 
  which system is authoritative before writing any order-placement code.

SCHEMA ADDITION NEEDED FIRST:
- Create `shipping_rules` table (tenant-scoped) with at minimum: 
  rule_type ('flat'|'free_above'|'zone'), flat_amount, free_above_threshold, 
  zone_pincode_ranges JSONB, is_active. Ecom checkout must compute 
  shipping_charge from this table, not a hardcoded value.

WORKFLOW TO IMPLEMENT:

1. Cart display: join `cart_items` against `ecom_available_stock` view for 
   live stock, and `product_pricing`/`ecom_price_overrides` for live price. 
   Do NOT reserve stock at this stage.

2. Checkout start (POST /api/checkout/start):
   - Validate address exists in `customer_addresses` for this customer
   - Validate payment method against `ecom_settings.payment_mode`
   - Insert `inventory_reservations` rows (status='held', 
     expires_at=NOW()+INTERVAL '15 minutes') for every cart line, inside 
     a transaction that re-checks `ecom_available_stock` per line and 
     rejects the whole checkout if any line is insufficient
   - Return a checkout session referencing these reservations

3. Build a background job (cron or scheduled function) that flips expired 
   `inventory_reservations` (status='held' AND expires_at < NOW()) to 
   status='released', freeing the stock back to ecom_available_stock. 
   Run this at least every few minutes.

4. Payment confirmation (webhook or COD-confirm endpoint) triggers 
   POST /api/checkout/confirm, which in ONE transaction:
   a. Re-validates the held reservations are still valid and unexpired
   b. Inserts sales_header (reuse the exact function POS uses — do not fork)
   c. Inserts sales_detail rows (reuse the exact function POS uses)
   d. Inserts sales_header_ecom (shipping_address_id, payment_method, 
      shipping_charge from shipping_rules calculation)
   e. For each sales_detail line: select oldest available stock_layers 
      rows for that variant_id + warehouse_id (FIFO by created_at), 
      decrement qty_remaining, insert matching sales_allocations rows
   f. Insert stock_ledger entry (txn_type='Sales', qty_out, 
      ref_type='SalesDetail', ref_id=sales_detail.id) per line
   g. Update the consumed inventory_reservations to status='converted'
   h. If prepaid: insert sales_payments row
   i. Delete the now-purchased rows from cart_items
   j. Commit. On any failure, roll back entirely and do not leave 
      reservations in a converted state.

5. Fulfillment status updates (admin-triggered): status transitions 
   Confirmed → Packed → Shipped update sales_header.status. On Shipped, 
   call the courier aggregator's create-shipment API and persist 
   courier_partner/awb_number/tracking_url to sales_header_ecom.

6. Courier webhook endpoint updates sales_header_ecom.delivery_status, 
   and maps delivery_status='delivered' → sales_header.status='Delivered' 
   (and only that one mapping automatically — other status changes stay 
   manual/admin-reviewed).

7. COD collection: on delivery confirmation, insert sales_payments and 
   update sales_header.payment_status='paid'.

Write integration tests for: (a) two concurrent checkouts attempting to 
reserve the last unit of the same variant — only one should succeed, 
(b) an expired reservation correctly releasing stock back to availability, 
(c) a full checkout confirming with FIFO stock_layers being consumed in 
correct creation order.