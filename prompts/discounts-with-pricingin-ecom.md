Implement functional discount badges, price strike-through, and dynamic discount pricing across the e-commerce storefront (Product Catalog/Grid and PDP) using existing database records without modifying POS behavior.

PRE-REQUISITE — DO NOT BREAK POS:
- POS billing calculates discounts dynamically and relies on `channel IN ('pos', 'both')`.
- Do not create any static "discounted_price" tables or overwrite `product_pricing`.
- All e-commerce discount calculations must be computed on the read path.

WORKFLOW TO IMPLEMENT:

1. Storefront Query / View Update:
   - In the API routes or SQL views powering public product listings (`ProductGrid.tsx`) and the Product Detail Page (`ProductDetail.tsx`), add a join to `discount_variants` and `discounts`:
     * Condition: `dv.variant_id = v.id` AND `d.is_active = true` AND `d.channel IN ('ecom', 'both')` AND `NOW() BETWEEN d.starts_at AND d.ends_at` AND `d.coupon_code IS NULL`
     * If multiple discounts apply to the same variant, pick the one with highest `d.priority` (or highest `d.value`).
   - Pricing Precedence:
     * Base pre-discount price = `COALESCE(ecom_price_overrides.ecom_price, product_pricing.final_selling_price)`.
     * Pre-tax unit base = `product_pricing.unit_price`.
   - Calculate `effective_price` matching the POS tax logic:
     * If percentage discount: Taxable amount = `unit_price * (1 - (d.value / 100))`; Effective price = `ROUND(taxable * (1 + (tax_percent / 100)), 2)`.
     * If fixed discount: Taxable amount = `GREATEST(0, unit_price - d.value)`; Effective price = `ROUND(taxable * (1 + (tax_percent / 100)), 2)`.
     * If no active discount: Effective price = `product_pricing.final_selling_price`.
   - Return payload fields per variant:
     * `original_price` (number)
     * `effective_price` (number)
     * `is_on_sale` (boolean: true when `effective_price < original_price`)
     * `discount_value` (number)
     * `discount_type` ('percentage' | 'fixed')
     * `discount_badge_text` (e.g., `"{value}% OFF"` or discount `name`)

2. Product Grid / Card Component (`ProductGrid.tsx`):
   - Render a Sale Badge on the product card thumbnail if `is_on_sale === true`.
   - In the pricing area:
     * Always display `effective_price` formatted with the store currency symbol.
     * If `is_on_sale === true`, display `original_price` alongside it with a strikethrough styling (`line-through text-gray-400`).

3. Product Detail Page (ProductDetail.tsx) Component:
   - Update variant selection handler to read the selected variant's `effective_price`, `original_price`, and `is_on_sale` status.
   - Display the active `effective_price` prominently.
   - If `is_on_sale === true`:
     * Display `original_price` with strikethrough styling.
     * Render the discount badge (e.g. `<Badge color="error">{discount_badge_text}</Badge>`).
     * Calculate and display total savings amount: `original_price - effective_price`.

4. Cart Sync Check:
   - Ensure the "Add to Cart" action adds the item at the verified `effective_price` (re-validated server-side, not trusted from client state).

VERIFICATION TESTS:
- Verify a variant mapped to an active discount with channel 'ecom' shows the badge and strike-through on storefront.
- Verify a variant mapped to a discount with channel 'pos' does NOT show a badge or discount on storefront.
- Verify that expired discounts (`ends_at < NOW()`) immediately revert storefront display to `original_price` with no badge.
- Verify that POS fast-billing calculations remain completely unaffected.