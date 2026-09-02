import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { PoolClient } from "pg";

/**
 * Validates Indian 10-digit mobile number format (starts with 6-9)
 */
export function validateIndianPhone(phone: string): boolean {
  const clean = String(phone || "").replace(/\s+|-|\+/g, "");
  // Strip leading 91 if present and length is 12
  const tenDigit = clean.length === 12 && clean.startsWith("91") ? clean.slice(2) : clean;
  return /^[6-9]\d{9}$/.test(tenDigit);
}

/**
 * Normalizes Indian phone to clean 10 digits
 */
export function normalizeIndianPhone(phone: string): string {
  const clean = String(phone || "").replace(/\s+|-|\+/g, "");
  return clean.length === 12 && clean.startsWith("91") ? clean.slice(2) : clean;
}

/**
 * Validates 6-digit Indian PIN code standard (cannot start with 0)
 */
export function validateIndianPincode(pincode: string): boolean {
  const clean = String(pincode || "").trim();
  return /^[1-9][0-9]{5}$/.test(clean);
}

/**
 * Validates standard email address format
 */
export function validateEmail(email: string): boolean {
  const clean = String(email || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean);
}

/**
 * Secure password hashing using crypto scrypt
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString("hex")}`;
}

/**
 * Verifies password against stored salt:hash string
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash || !storedHash.includes(":")) return false;
  try {
    const [salt, key] = storedHash.split(":");
    const derivedKey = scryptSync(password, salt, 64);
    const keyBuffer = Buffer.from(key, "hex");
    return timingSafeEqual(derivedKey, keyBuffer);
  } catch (err) {
    return false;
  }
}

/**
 * Ensures schema migration for customer and address tables
 */
export async function ensureCustomerSchema(client: PoolClient, schema: string): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".customers (
      id SERIAL PRIMARY KEY,
      cust_code VARCHAR(20) UNIQUE,
      cust_name VARCHAR(50) NOT NULL,
      name VARCHAR(50),
      email VARCHAR(150),
      phone VARCHAR(20),
      channel VARCHAR(20) NOT NULL DEFAULT 'pos' CHECK (channel IN ('pos', 'ecom', 'both')),
      password_hash VARCHAR(255) NULL,
      is_verified BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT now()
    );
  `);

  await client.query(`
    ALTER TABLE "${schema}".customers
      ADD COLUMN IF NOT EXISTS channel VARCHAR(20) NOT NULL DEFAULT 'pos',
      ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) NULL,
      ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE;

    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = '${schema}' AND table_name = 'customers' AND constraint_name = 'unique_cust_email'
      ) THEN
        ALTER TABLE "${schema}".customers DROP CONSTRAINT unique_cust_email;
      END IF;
    END $$;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_unique_email
    ON "${schema}".customers (email) WHERE email IS NOT NULL AND email <> '';

    CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_unique_phone
    ON "${schema}".customers (phone) WHERE phone IS NOT NULL AND phone <> '';
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".customer_addresses (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES "${schema}".customers(id) ON DELETE CASCADE,
      recipient_name VARCHAR(100),
      recipient_phone VARCHAR(20),
      address_line1 VARCHAR(200),
      address_line2 VARCHAR(200),
      address_line3 VARCHAR(200),
      city VARCHAR(100),
      state VARCHAR(100),
      pincode VARCHAR(20),
      country VARCHAR(100) DEFAULT 'India',
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    ALTER TABLE "${schema}".customer_addresses
      ADD COLUMN IF NOT EXISTS recipient_name VARCHAR(100),
      ADD COLUMN IF NOT EXISTS recipient_phone VARCHAR(20);

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = '${schema}' AND table_name = 'customer_addresses' AND constraint_name = 'chk_india_pincode'
      ) THEN
        ALTER TABLE "${schema}".customer_addresses
          ADD CONSTRAINT chk_india_pincode CHECK (pincode IS NULL OR pincode ~ '^[1-9][0-9]{5}$');
      END IF;
    END $$;
  `);
}
