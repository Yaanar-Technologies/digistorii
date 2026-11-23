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

        -- 3. Ensure clean deduplication and restore UNIQUE constraint on order_id
        EXECUTE format('
            DELETE FROM %I.online_order_deliveries
            WHERE id IN (
              SELECT id FROM (
                SELECT id,
                       ROW_NUMBER() OVER (
                         PARTITION BY order_id
                         ORDER BY
                           CASE WHEN awb_number IS NOT NULL AND TRIM(awb_number) != '''' THEN 0 ELSE 1 END,
                           updated_at DESC NULLS LAST,
                           created_at DESC,
                           id DESC
                       ) as rnum
                FROM %I.online_order_deliveries
              ) duplicates
              WHERE rnum > 1
            );
        ', schema_name, schema_name);

        EXECUTE format('
            DO $inner$
            BEGIN
              IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_class t ON c.conrelid = t.oid
                JOIN pg_namespace n ON t.relnamespace = n.oid
                WHERE n.nspname = %L
                  AND t.relname = ''online_order_deliveries''
                  AND c.contype = ''u''
                  AND c.conkey = ARRAY[(
                    SELECT attnum FROM pg_attribute
                    WHERE attrelid = t.oid AND attname = ''order_id''
                  )]
              ) THEN
                ALTER TABLE %I.online_order_deliveries
                  ADD CONSTRAINT online_order_deliveries_order_id_key UNIQUE (order_id);
              END IF;
            EXCEPTION WHEN OTHERS THEN
              NULL;
            END $inner$;
        ', schema_name, schema_name);

        -- 5. Create index on manifest_id for bulk dispatch tracking
        EXECUTE format('
            CREATE INDEX IF NOT EXISTS idx_%I_deliveries_manifest
                ON %I.online_order_deliveries (manifest_id)
                WHERE manifest_id IS NOT NULL;
        ', schema_name, schema_name);

    END LOOP;
END $$;

