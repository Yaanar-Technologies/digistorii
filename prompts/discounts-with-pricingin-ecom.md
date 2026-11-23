Update the Discount Scheme creation/edit UI {src\app\[company]\(user)\workspace\inventory\discounts\page.tsx} and API to support plan-based channel selection (`pos`, `ecom`, `both`) matching our subscription plan gating logic used in the Product Catalog:

1. **Plan-Based Channel Gating (Frontend UI):**
   - Check the tenant's active subscription plan flags (whether POS is enabled and whether E-Commerce is enabled, using the exact same plan check pattern used in the Product Catalog).
   - **If BOTH POS and E-Commerce are enabled on the plan:** Render two toggle switches/checkboxes in the Discount Create/Edit modal/form: **"Apply to POS"** and **"Apply to E-Commerce"** (default both to `true`, which maps to `channel = 'both'`).
     - Validation: Do not allow saving if both toggles are turned off (show an inline error: "Select at least one channel").
     - Mapping: Both ON -> `'both'`, only POS ON -> `'pos'`, only E-Commerce ON -> `'ecom'`.
   - **If ONLY E-Commerce is enabled (no POS):** Hide or lock the POS toggle, auto-set `channel = 'ecom'`, and show a compact read-only badge/note: "Applies to E-Commerce (POS not included in current plan)".
   - **If ONLY POS is enabled (no E-Commerce):** Hide or lock the E-Commerce toggle, auto-set `channel = 'pos'`, and show a compact read-only badge/note: "Applies to POS (E-Commerce not included in current plan)".

2. **Discount List / Table Display:**
   - Display a compact channel badge (`POS`, `E-Com`, or `POS & E-Com`) on each row in the Discounts table so admins can immediately see where each discount applies.

3. **Backend API Validation & Checkout Enforcement:**
   - In `POST /api/discounts` and `PUT /api/discounts/[id]`: Validate the incoming `channel` value against the tenant's active plan entitlements. If a tenant without POS tries to submit `'pos'` or `'both'`, either reject with `403` or force-clamp it to `'ecom'` (and vice versa if no E-Com).
   - Ensure POS billing discount lookup queries filter by `channel IN ('pos', 'both')` and E-Commerce storefront/checkout discount queries filter by `channel IN ('ecom', 'both')`.