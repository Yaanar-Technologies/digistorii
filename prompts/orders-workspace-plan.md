Refactor ecom order metadata out of `sales_header` into a dedicated 1:1 
extension table, so plans without ecommerce access carry zero ecom-related 
schema footprint.

1. DO NOT alter `sales_header` or `sales_detail` in createCompanySchema. 
   Revert/skip any prior plan to add channel/payment_method/shipping_address_id/
   delivery_status/courier_partner/awb_number/tracking_url columns there.

2. In createEcomSchema, add:

   CREATE TABLE IF NOT EXISTS "${schema}".sales_header_ecom (
     sales_id INT PRIMARY KEY
       REFERENCES "${schema}".sales_header(id) ON DELETE CASCADE,
     shipping_address_id INT REFERENCES "${schema}".customer_addresses(id),
     payment_method VARCHAR(20)
       CHECK (payment_method IN ('cod','upi','card','online')),
     shipping_charge NUMERIC(12,2) DEFAULT 0,
     delivery_status VARCHAR(30),
     courier_partner VARCHAR(50),
     awb_number VARCHAR(50),
     tracking_url TEXT,
     placed_at TIMESTAMP DEFAULT NOW(),
     created_at TIMESTAMP DEFAULT NOW(),
     updated_at TIMESTAMP DEFAULT NOW()
   );

   CREATE INDEX IF NOT EXISTS idx_sales_header_ecom_delivery_status
     ON "${schema}".sales_header_ecom(delivery_status);

3. ORDER PLACEMENT (ecom checkout flow):
   - Insert into `sales_header` exactly as POS does today (same columns, 
     same generateSalesNo, same insert function — do not fork this logic).
   - Insert matching `sales_detail` rows exactly as POS does today, reusing 
     the same stock-allocation/stock_ledger writing path.
   - Immediately after, insert one row into `sales_header_ecom` keyed by 
     the new `sales_header.id`, carrying shipping_address_id, payment_method, 
     shipping_charge. All three inserts happen inside the same DB transaction 
     as the stock deduction.
   - POS billing inserts NOTHING into sales_header_ecom — it simply doesn't 
     know this table exists.

4. ORDER READS:
   - "Channel" is now derived, not stored: an order is ecom if a matching 
     sales_header_ecom row exists, else it's POS. Build a shared query 
     helper (e.g. getOrderWithChannel(salesId)) that does 
     `sales_header LEFT JOIN sales_header_ecom` and returns a `channel` 
     field computed as CASE WHEN sales_header_ecom.sales_id IS NOT NULL 
     THEN 'ecom' ELSE 'pos' END.
   - Customer-facing "My Orders" (ecom) must INNER JOIN sales_header_ecom 
     (only ecom orders visible to storefront customers).
   - Admin order list should show both, using the LEFT JOIN + derived channel.

5. DELIVERY WEBHOOK:
   - POST /api/delivery/webhook/:courier updates delivery_status, 
     courier_partner, awb_number, tracking_url on the matching 
     sales_header_ecom row (via sales_id), and maps delivery_status to 
     sales_header.status per the existing rules (e.g. delivered → 'Delivered').

6. Guard: any code path that tries to write ecom-specific columns for a 
   tenant without ecom access must fail gracefully (sales_header_ecom simply 
   won't exist as a table for that schema — this should never be reachable 
   since only ecom-enabled tenants' storefronts can create orders in the 
   first place, but add a plan-check at the checkout API entry point as 
   defense in depth).

Verify: create a POS-only tenant (createEcomSchema never runs) and confirm 
sales_header has no new columns and no orphaned NULLs — schema should be 
byte-for-byte what createCompanySchema alone produces today.