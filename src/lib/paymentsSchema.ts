import { Pool, PoolClient } from "pg";

type Queryable = Pool | PoolClient;

export async function ensurePaymentsSchema(client: Queryable, schema: string): Promise<void> {
  // 1. Additive columns for ecom_settings
  await client.query(`
    ALTER TABLE "${schema}".ecom_settings
      ADD COLUMN IF NOT EXISTS cod_max_order_value NUMERIC(10,2) DEFAULT 5000,
      ADD COLUMN IF NOT EXISTS cod_require_otp BOOLEAN DEFAULT FALSE;
  `);

  // 2. Additive columns for shipping_zone_pincodes
  await client.query(`
    ALTER TABLE "${schema}".shipping_zone_pincodes
      ADD COLUMN IF NOT EXISTS cod_available BOOLEAN DEFAULT TRUE;
  `);

  // 3. Additive columns for payment_gateway_configs
  await client.query(`
    ALTER TABLE "${schema}".payment_gateway_configs
      ADD COLUMN IF NOT EXISTS is_test_mode BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS is_live_mode BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS key_secret_enc VARCHAR(255),
      ADD COLUMN IF NOT EXISTS test_key_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS test_key_secret_enc VARCHAR(255),
      ADD COLUMN IF NOT EXISTS live_key_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS live_key_secret_enc VARCHAR(255),
      ADD COLUMN IF NOT EXISTS test_webhook_secret_enc VARCHAR(255),
      ADD COLUMN IF NOT EXISTS live_webhook_secret_enc VARCHAR(255);

    UPDATE "${schema}".payment_gateway_configs
    SET key_secret_enc = key_secret
    WHERE key_secret_enc IS NULL AND key_secret IS NOT NULL;
  `);

  // 4. Payment Webhook Events (Idempotency deduplication)
  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".payment_webhook_events (
      id SERIAL PRIMARY KEY,
      company_id INT,
      event_id VARCHAR(100) NOT NULL UNIQUE,
      event_type VARCHAR(100) NOT NULL,
      payload JSONB,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_type
      ON "${schema}".payment_webhook_events(event_type);
  `);

  // 5. Payment Refunds Table (Audit & Partial Refunds)
  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".payment_refunds (
      id SERIAL PRIMARY KEY,
      company_id INT,
      order_id BIGINT NOT NULL REFERENCES "${schema}".online_orders(id) ON DELETE CASCADE,
      payment_id BIGINT REFERENCES "${schema}".online_order_payments(id) ON DELETE SET NULL,
      gateway_refund_id VARCHAR(100),
      amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      status VARCHAR(50) NOT NULL DEFAULT 'INITIATED', -- 'INITIATED', 'SUCCESS', 'FAILED'
      failure_reason TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_payment_refunds_order
      ON "${schema}".payment_refunds(order_id);
    CREATE INDEX IF NOT EXISTS idx_payment_refunds_status
      ON "${schema}".payment_refunds(status);
  `);

  // 6. Admin Operational Alerts
  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".admin_operational_alerts (
      id SERIAL PRIMARY KEY,
      company_id INT,
      alert_type VARCHAR(50) NOT NULL, -- 'REFUND_FAILURE', 'WEBHOOK_FAILURE', 'PAYMENT_MISMATCH'
      severity VARCHAR(20) NOT NULL DEFAULT 'WARNING', -- 'INFO', 'WARNING', 'CRITICAL'
      title VARCHAR(200) NOT NULL,
      message TEXT NOT NULL,
      payload JSONB,
      is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_admin_operational_alerts_active
      ON "${schema}".admin_operational_alerts(is_resolved, severity);
  `);

  // 7. Statutory Tax Invoices (GST Compliant)
  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".tax_invoices (
      id SERIAL PRIMARY KEY,
      company_id INT,
      order_id BIGINT NOT NULL UNIQUE REFERENCES "${schema}".online_orders(id) ON DELETE CASCADE,
      invoice_no VARCHAR(100) NOT NULL UNIQUE,
      financial_year VARCHAR(20) NOT NULL,
      invoice_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      customer_name VARCHAR(150),
      customer_gstin VARCHAR(20),
      billing_address TEXT,
      shipping_address TEXT,
      place_of_supply VARCHAR(100),
      state_code VARCHAR(10),
      is_interstate BOOLEAN NOT NULL DEFAULT FALSE,
      subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
      cgst_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      sgst_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      igst_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      total_tax NUMERIC(12,2) NOT NULL DEFAULT 0,
      total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      items JSONB NOT NULL DEFAULT '[]'::jsonb,
      pdf_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_tax_invoices_order
      ON "${schema}".tax_invoices(order_id);
    CREATE INDEX IF NOT EXISTS idx_tax_invoices_no
      ON "${schema}".tax_invoices(invoice_no);
  `);

  // 8. Statutory Credit Notes (GST Compliant for Returns)
  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".credit_notes (
      id SERIAL PRIMARY KEY,
      company_id INT,
      order_id BIGINT NOT NULL REFERENCES "${schema}".online_orders(id) ON DELETE CASCADE,
      return_id INT REFERENCES "${schema}".order_returns(id) ON DELETE SET NULL,
      invoice_id INT REFERENCES "${schema}".tax_invoices(id) ON DELETE SET NULL,
      credit_note_no VARCHAR(100) NOT NULL UNIQUE,
      credit_note_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      original_invoice_no VARCHAR(100),
      reason TEXT,
      taxable_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      cgst_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      sgst_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      igst_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      items JSONB NOT NULL DEFAULT '[]'::jsonb,
      pdf_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_credit_notes_order
      ON "${schema}".credit_notes(order_id);
    CREATE INDEX IF NOT EXISTS idx_credit_notes_no
      ON "${schema}".credit_notes(credit_note_no);
  `);
}

