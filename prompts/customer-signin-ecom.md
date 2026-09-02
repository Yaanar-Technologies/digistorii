Implement customer authentication, profile management, and account separation between POS and E-Commerce channels using the existing customer tables without disrupting POS quick-billing.

CONTEXT & CURRENT CONSTRAINTS:
- POS billing typically collects only `cust_name` / `phone` and must NOT be blocked by mandatory e-commerce fields (email, address, password).
- E-Commerce requires authenticated users, Indian phone/email verification, and delivery address capture with mandatory 6-digit Indian PIN code.
- Current constraints to fix in `${schema}.customers`:
  * `CONSTRAINT unique_cust_email UNIQUE(email)` will crash if multiple walk-in POS customers have `NULL` or empty emails.
  * We need a secure credential mechanism (password hash or OTP session) for e-commerce sign-in without breaking POS's direct-insert ability.

WORKFLOW TO IMPLEMENT:

1. Schema Migration:
   - Alter `${schema}.customers`:
     * Add `channel` VARCHAR(20) NOT NULL DEFAULT 'pos' (allowed values: 'pos', 'ecom', 'both').
     * Add `password_hash` VARCHAR(255) NULL (only populated when an e-commerce customer registers or sets a password).
     * Add `is_verified` BOOLEAN NOT NULL DEFAULT FALSE.
     * Drop the strict `unique_cust_email` constraint if it forbids multiple NULLs; replace with a partial unique index:
       `CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_unique_email ON "${schema}".customers (email) WHERE email IS NOT NULL AND email <> '';`
     * Add a partial unique index on phone:
       `CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_unique_phone ON "${schema}".customers (phone) WHERE phone IS NOT NULL AND phone <> '';`
   - Alter `${schema}.customer_addresses`:
     * Add `recipient_name` VARCHAR(100), `recipient_phone` VARCHAR(20).
     * Add constraint enforcing 6-digit numeric PIN codes (India standard):
       `CONSTRAINT chk_india_pincode CHECK (pincode ~ '^[1-9][0-9]{5}$');`
     * Set default `country` to 'India'.

2. Account Reconciliation Logic (POS vs E-Com):
   - When an e-commerce user signs up or checks in using phone/email:
     * Check if a customer record already exists matching that `phone` or `email`.
     * If an existing record was created via POS (`channel = 'pos'`):
       - Do NOT create a duplicate record.
       - Upgrade customer: set `channel = 'both'`, update `password_hash` (or verify via OTP), and update `cust_name` / `email`.
     * If no existing record:
       - Insert new row with `channel = 'ecom'`, generate sequential `cust_code` (e.g. `ECO-XXXXX`).

3. E-Commerce Authentication Endpoints:
   - POST `/api/ecom/auth/register`:
     * Validates: `cust_name`, Indian phone (10 digits `^[6-9]\d{9}$`), valid `email`, and `password`.
     * Reconciles or creates customer row using the logic in Step 2.
     * Returns JWT or session cookie containing `{ customer_id, channel, email, phone }`.
   - POST `/api/ecom/auth/login`:
     * Validates credentials against `password_hash` for that email/phone.
     * Ensures customer has access (`channel IN ('ecom', 'both')`).
     * Issues authenticated session cookie/token.
   - POST `/api/ecom/auth/logout`: Clears session token.

4. Address Book Endpoints (E-Commerce Storefront):
   - GET `/api/ecom/customer/addresses`:
     * Returns all saved addresses for the authenticated `customer_id`.
   - POST `/api/ecom/customer/addresses`:
     * Validates: `recipient_name`, `recipient_phone`, `address_line1`, `city`, `state`, and 6-digit `pincode` (India only).
     * If `is_default = true`, atomically set existing addresses for this `customer_id` to `is_default = false`.
     * Inserts new row into `${schema}.customer_addresses`.

VERIFICATION TESTS:
- Verify a walk-in POS customer can still be inserted with only `phone` and `cust_name` (no email or password), defaulting to `channel = 'pos'`.
- Verify multiple POS customers with NULL email do not trigger unique constraint errors.
- Verify that when an existing POS customer registers online using the same phone number, the record is upgraded to `channel = 'both'` rather than creating a duplicate customer ID.
- Verify attempting to save an address with an invalid PIN code (e.g. '012345', 'ABCDE', or 5 digits) fails validation.