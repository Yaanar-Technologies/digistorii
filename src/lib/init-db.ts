import { pool } from "../lib/db";
import { ensureResponsibilitySchema } from "./userResponsibilities";

declare global {
  var dbInitialized: boolean | undefined;
}

export async function initializeDatabase() {
  // Skip if already initialized (memory level)
  if (global.dbInitialized) {
    return;
  }

  const client = await pool.connect();
  const LOCK_ID = 849204819;

  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_ID]);
    console.log("Running DB initialization / migrations...");
    await client.query("BEGIN");

    // Enable UUID extension
    await client.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

    // ===============================
    // COMPANIES TABLE
    // ===============================
    await client.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id SERIAL PRIMARY KEY,
        company_name VARCHAR(200) NOT NULL UNIQUE,
        gst_number VARCHAR(20),
        gst_available BOOLEAN NOT NULL DEFAULT FALSE,
        pan_number VARCHAR(20),
        currency VARCHAR(10),
        address TEXT,
        city VARCHAR(100),
        state VARCHAR(100),
        country VARCHAR(100),
        subdomain_url VARCHAR(200) NOT NULL UNIQUE,
        schema_name VARCHAR(100) NOT NULL UNIQUE,
        subscription_plan VARCHAR(50) DEFAULT 'BASIC',
        setup_stage VARCHAR(40) DEFAULT 'ACCOUNT_CREATED',
        status VARCHAR(20) DEFAULT 'ACTIVE',
        has_completed_guided_setup BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now(),
        verification_token TEXT UNIQUE,
        custom_domain VARCHAR(255) UNIQUE,
        custom_domain_status VARCHAR(20) NOT NULL DEFAULT 'not_configured'
          CHECK (custom_domain_status IN ('not_configured','pending_dns','verified','failed')),
        custom_domain_verified_at TIMESTAMP
      );
    `);


    // ===============================
    // USERS TABLE
    // ===============================
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL
          REFERENCES companies(id) ON DELETE CASCADE,
        name VARCHAR(200) NOT NULL,
        email VARCHAR(200) NOT NULL UNIQUE,
        phone VARCHAR(20) NOT NULL UNIQUE,
        username VARCHAR(100),
        password_hash TEXT NOT NULL,
        responsibility_id INT,
        phone_verified BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT true,
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT now(),
        UNIQUE(company_id, username),
        UNIQUE(company_id, email)
      );
    `);
    await client.query(`
  CREATE TABLE IF NOT EXISTS plans (
  id             SERIAL PRIMARY KEY,
  name           VARCHAR(50) NOT NULL UNIQUE,  -- 'STARTER', 'GROWTH', 'ENTERPRISE'
  price_monthly  INTEGER NOT NULL DEFAULT 0,   -- in paise (INR smallest unit)
  price_yearly   INTEGER NOT NULL DEFAULT 0,
  billing_period  VARCHAR(50) DEFAULT 'Monthly / Yearly',
  features        JSONB NOT NULL DEFAULT '[]'::jsonb,
  display_order   INTEGER DEFAULT 0,
  is_active      BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMP DEFAULT NOW()
);
`);

    await client.query(`
  CREATE TABLE IF NOT EXISTS company_subscriptions (
  id                    SERIAL PRIMARY KEY,
  company_id            INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plan_id               INTEGER NOT NULL REFERENCES plans(id),
  plan_code             VARCHAR(50),
  ecommerce_access      BOOLEAN DEFAULT FALSE,
  max_users             INTEGER DEFAULT 5,
  max_warehouses        INTEGER DEFAULT 1,
  max_locations         INTEGER DEFAULT 1,
  billing_interval      VARCHAR(20) DEFAULT 'monthly',
  amount                INTEGER DEFAULT 0,
  payment_status        VARCHAR(20) DEFAULT 'created',
  razorpay_order_id     TEXT,
  subscription_start    TIMESTAMP,
  subscription_end      TIMESTAMP,
  status                VARCHAR(20) DEFAULT 'TRIALING',  -- 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED'
  trial_ends_at         TIMESTAMP,
  current_period_start  TIMESTAMP,
  current_period_end    TIMESTAMP,
  cancelled_at          TIMESTAMP,
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW()
);`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id                    SERIAL PRIMARY KEY,
        company_id            INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        subscription_id       INTEGER REFERENCES company_subscriptions(id),
        plan_name             TEXT NOT NULL,
        plan_price            INTEGER NOT NULL,
        payment_type          VARCHAR(50) DEFAULT 'SUBSCRIPTION_NEW',
        billing_interval      VARCHAR(20) DEFAULT 'monthly',
        razorpay_order_id     TEXT,
        razorpay_payment_id   TEXT,
        razorpay_signature    TEXT,
        amount                INTEGER NOT NULL,
        currency              TEXT DEFAULT 'INR',
        status                TEXT DEFAULT 'created',
        payment_status        TEXT DEFAULT 'created',
        subscription_start    TIMESTAMP,
        subscription_end      TIMESTAMP,
         metadata JSONB DEFAULT '{}'::jsonb,
        created_at            TIMESTAMP DEFAULT NOW(),
        updated_at            TIMESTAMP DEFAULT NOW()
      );
`);



    await client.query(`
  CREATE TABLE IF NOT EXISTS onboarding_otps (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    otp_hash TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    resend_count INTEGER NOT NULL DEFAULT 0,
    verified_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
  );
`);
    await client.query(`
  CREATE TABLE IF NOT EXISTS plan_features (
  id           SERIAL PRIMARY KEY,
  plan_id      INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  feature_key  VARCHAR(100) NOT NULL,   -- 'max_users', 'max_locations', 'max_pos_terminals', 'ecommerce_access'
  value_int    INTEGER,                 -- used for numeric limits
  value_bool   BOOLEAN,                -- used for feature flags
  UNIQUE(plan_id, feature_key)
);`);


    await client.query(`
  CREATE UNIQUE INDEX IF NOT EXISTS uq_company_subscriptions_company
  ON company_subscriptions(company_id);
`);


    await client.query(`
      CREATE TABLE IF NOT EXISTS company_user_map (
      id           SERIAL PRIMARY KEY,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      username     VARCHAR(100),
      responsibility_id INT,
      location_id  INTEGER,
      warehouse_id INTEGER,
      is_active    BOOLEAN DEFAULT TRUE,
      joined_at    TIMESTAMP DEFAULT NOW(),
      UNIQUE(company_id, username),
      UNIQUE(user_id, company_id)
);
  `);


    await client.query(`
INSERT INTO plans (name,price_monthly,price_yearly,billing_period,features,display_order,is_active
)
VALUES
(
    'INSTORE',500,5500,'Monthly / Yearly',
    '[
        "Dedicated In-Store POS Billing System",
        "1 Warehouse + 1 Store Location",
        "Up to 5 User Accounts",
        "Inventory, Purchase, Sales & Reports Included",
        "Retail Store Operations Management",
        "Suitable for Businesses Selling In-Store Only"
    ]'::jsonb,
    1,
    TRUE
),(
    'ECOM',1000,10000,'Monthly / Yearly',
    '[
        "Dedicated E-Commerce Website",
        "1 Warehouse + 1 Store Location",
        "Up to 5 User Accounts",
        "Inventory, Purchase, Sales & Reports Included",
        "Online Order & Catalog Management",
        "Suitable for Businesses Selling Online Only"
    ]'::jsonb,
    2,
    TRUE
),
(
    'BASIC',1500,16500,'Monthly / Yearly',
    '[
        "E-Commerce Website + In-Store POS",
        "1 Warehouse + 1 Store Location",
        "Up to 5 User Accounts",
        "Inventory, Purchase, Sales & Reports Included",
        "Unified Online & Offline Sales Management",
        "Ideal for Small Businesses"
    ]'::jsonb,
    3,
    TRUE
),
(
    'GROWTH',6000,56000,'Monthly / Yearly',
    '[
        "E-Commerce Website + In-Store POS",
        "Up to 5 Warehouses + 5 Store Locations",
        "Up to 10 User Accounts",
        "Inventory, Purchase, Sales & Reports Included",
        "Multi-Location Business Management",
        "Designed for Growing Businesses"
    ]'::jsonb,
    4,
    TRUE
),
(
    'ENTERPRISE', 22500,247500,'Monthly / Yearly',
    '[
        "E-Commerce Website + In-Store POS",
        "Unlimited Warehouses + Store Locations",
        "Unlimited User Accounts",
        "Inventory, Purchase, Sales & Reports Included",
        "Advanced Multi-Branch Operations",
        "Built for Large Enterprise Organizations"
    ]'::jsonb,
    5,
    TRUE
)
ON CONFLICT (name) DO UPDATE
SET
    price_monthly  = EXCLUDED.price_monthly,
    price_yearly   = EXCLUDED.price_yearly,
    billing_period = EXCLUDED.billing_period,
    features       = EXCLUDED.features,
    display_order  = EXCLUDED.display_order,
    is_active      = EXCLUDED.is_active;
    `);

    await client.query(`
    INSERT INTO plan_features (plan_id, feature_key, value_int, value_bool)
SELECT p.id, v.feature_key, v.value_int, v.value_bool
FROM plans p
JOIN (
    VALUES
        ('INSTORE', 'max_users', 5, NULL::BOOLEAN),
        ('INSTORE', 'max_locations', 1, NULL::BOOLEAN),
        ('INSTORE', 'max_warehouses', 1, NULL::BOOLEAN),
        ('INSTORE', 'ecommerce_access', NULL::INTEGER, FALSE),
        ('ECOM', 'max_users', 5, NULL::BOOLEAN),
        ('ECOM', 'max_locations', 1, NULL::BOOLEAN),
        ('ECOM', 'max_warehouses', 1, NULL::BOOLEAN),
        ('ECOM', 'ecommerce_access', NULL::INTEGER, TRUE),
        ('BASIC', 'max_users', 5, NULL::BOOLEAN),
        ('BASIC', 'max_locations', 1, NULL::BOOLEAN),
        ('BASIC', 'max_warehouses', 1, NULL::BOOLEAN),
        ('BASIC', 'ecommerce_access', NULL::INTEGER, TRUE),
        ('GROWTH', 'max_users', 10, NULL::BOOLEAN),
        ('GROWTH', 'max_locations', 5, NULL::BOOLEAN),
        ('GROWTH', 'max_warehouses', 5, NULL::BOOLEAN),
        ('GROWTH', 'ecommerce_access', NULL::INTEGER, TRUE),
        ('ENTERPRISE', 'max_users', 20, NULL::BOOLEAN),
        ('ENTERPRISE', 'max_locations', 5, NULL::BOOLEAN),
        ('ENTERPRISE', 'max_warehouses', 5, NULL::BOOLEAN),
        ('ENTERPRISE', 'ecommerce_access', NULL::INTEGER, TRUE)
       ) AS v(plan_name, feature_key, value_int, value_bool)
    ON v.plan_name = p.name
ON CONFLICT (plan_id, feature_key) DO UPDATE
SET
    value_int  = EXCLUDED.value_int,
    value_bool = EXCLUDED.value_bool;
    `);


    await ensureResponsibilitySchema(client);

    // 1. Ensure custom domain columns exist on public.companies table
    await client.query(`
      ALTER TABLE public.companies
        ADD COLUMN IF NOT EXISTS custom_domain VARCHAR(255) UNIQUE,
        ADD COLUMN IF NOT EXISTS custom_domain_status VARCHAR(20) NOT NULL DEFAULT 'not_configured',
        ADD COLUMN IF NOT EXISTS custom_domain_verified_at TIMESTAMP;
    `);

    await client.query(`
      ALTER TABLE public.payments 
      ADD COLUMN IF NOT EXISTS payment_type VARCHAR(50) DEFAULT 'SUBSCRIPTION_NEW',
      ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
    `);

    await ensureResponsibilitySchema(client);
    await client.query("COMMIT");
    console.log("DB initialized successfully");
    global.dbInitialized = true;
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error initializing DB:", err);
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_ID]);
    client.release();
  }
}

async function upgradeTenantSchemas(client: any) {
  const companiesRes = await client.query("SELECT schema_name FROM public.companies");
  for (const row of companiesRes.rows) {
    const schema = row.schema_name;
    console.log(`Upgrading schema: ${schema}`);

    await client.query(`
      ALTER TABLE "${schema}".business_settings
        ADD COLUMN IF NOT EXISTS default_low_stock_threshold INT NOT NULL DEFAULT 5,
        ADD COLUMN IF NOT EXISTS default_backorders_allowed BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS low_stock_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS low_stock_email_notifications_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    await client.query(`
      ALTER TABLE "${schema}".product_variants
        ADD COLUMN IF NOT EXISTS low_stock_threshold INT,
        ADD COLUMN IF NOT EXISTS backorders_allowed BOOLEAN,
        ADD COLUMN IF NOT EXISTS last_low_stock_notified_at TIMESTAMPTZ;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".notification_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_type VARCHAR(50) NOT NULL,
        user_id INTEGER NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT now(),
        UNIQUE (event_type, user_id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT now()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".notification_recipients (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        notification_id UUID NOT NULL REFERENCES "${schema}".notifications(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL,
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        read_at TIMESTAMPTZ,
        delivered_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT now(),
        UNIQUE (notification_id, user_id)
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_notif_recipients_user_unread 
      ON "${schema}".notification_recipients (user_id, is_read);
    `);
  }
}

