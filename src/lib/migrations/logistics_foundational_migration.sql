-- ============================================================================
-- Logistics Foundational Migration (DigiStorii Multi-Tenant SaaS)
-- Applies to: All tenant schemas
-- ============================================================================

DO $$
DECLARE
    tenant_rec RECORD;
    schema_name TEXT;
BEGIN
    FOR tenant_rec IN 
        SELECT s.schema_name
        FROM information_schema.schemata s
        JOIN public.companies c ON LOWER(c.schema_name) = LOWER(s.schema_name)
    LOOP
        schema_name := tenant_rec.schema_name;
        RAISE NOTICE 'Applying Logistics Foundational Migration to schema: %', schema_name;

        -- 1. Ensure Courier Credential Columns on ecom_settings
        EXECUTE format('
            ALTER TABLE %I.ecom_settings
                ADD COLUMN IF NOT EXISTS delivery_partner VARCHAR(30) DEFAULT NULL,
                ADD COLUMN IF NOT EXISTS delivery_api_key_enc TEXT,
                ADD COLUMN IF NOT EXISTS delivery_api_secret_enc TEXT,
                ADD COLUMN IF NOT EXISTS delivery_webhook_secret_enc TEXT,
                ADD COLUMN IF NOT EXISTS pickup_location_code VARCHAR(100);
        ', schema_name);

        -- 2. Additive Columns on online_order_deliveries
        EXECUTE format('
            ALTER TABLE %I.online_order_deliveries
                ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
                ADD COLUMN IF NOT EXISTS length_cm NUMERIC(10,2),
                ADD COLUMN IF NOT EXISTS width_cm NUMERIC(10,2),
                ADD COLUMN IF NOT EXISTS height_cm NUMERIC(10,2),
                ADD COLUMN IF NOT EXISTS actual_weight_grams NUMERIC(10,2),
                ADD COLUMN IF NOT EXISTS volumetric_weight_grams NUMERIC(10,2),
                ADD COLUMN IF NOT EXISTS manifest_id VARCHAR(100);
        ', schema_name);

        -- 3. Drop rigid single-shipment constraint on order_id
        EXECUTE format('
            ALTER TABLE %I.online_order_deliveries
                DROP CONSTRAINT IF EXISTS online_order_deliveries_order_id_key;
        ', schema_name);

        -- 4. Create composite unique index (order_id, awb_number)
        EXECUTE format('
            CREATE UNIQUE INDEX IF NOT EXISTS uq_%I_deliveries_order_awb
                ON %I.online_order_deliveries (order_id, awb_number)
                WHERE awb_number IS NOT NULL;
        ', schema_name, schema_name);

        -- 5. Create index on manifest_id for bulk dispatch tracking
        EXECUTE format('
            CREATE INDEX IF NOT EXISTS idx_%I_deliveries_manifest
                ON %I.online_order_deliveries (manifest_id)
                WHERE manifest_id IS NOT NULL;
        ', schema_name, schema_name);

    END LOOP;
END $$;

