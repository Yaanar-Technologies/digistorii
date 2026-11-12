import { Pool, PoolClient } from "pg";

type Queryable = Pool | PoolClient;

export async function ensureLogisticsSchema(client: Queryable, schema: string): Promise<void> {
  // 1. Additive columns for online_order_deliveries
  await client.query(`
    ALTER TABLE "${schema}".online_order_deliveries
      ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 3,
      ADD COLUMN IF NOT EXISTS failure_reason TEXT,
      ADD COLUMN IF NOT EXISTS next_retry_date TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS rto_initiated_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS rto_delivered_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS pod_type VARCHAR(20),
      ADD COLUMN IF NOT EXISTS pod_resource_url TEXT,
      ADD COLUMN IF NOT EXISTS delivered_to_person_name VARCHAR(150),
      ADD COLUMN IF NOT EXISTS delivery_coordinates JSONB,
      ADD COLUMN IF NOT EXISTS shipping_label_url TEXT,
      ADD COLUMN IF NOT EXISTS return_awb VARCHAR(100),
      ADD COLUMN IF NOT EXISTS return_pickup_scheduled_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS length_cm NUMERIC(10,2),
      ADD COLUMN IF NOT EXISTS width_cm NUMERIC(10,2),
      ADD COLUMN IF NOT EXISTS height_cm NUMERIC(10,2),
      ADD COLUMN IF NOT EXISTS actual_weight_grams NUMERIC(10,2),
      ADD COLUMN IF NOT EXISTS volumetric_weight_grams NUMERIC(10,2),
      ADD COLUMN IF NOT EXISTS manifest_id VARCHAR(100);

    -- Relax single delivery per order constraint to allow re-shipments and returns
    ALTER TABLE "${schema}".online_order_deliveries
      DROP CONSTRAINT IF EXISTS online_order_deliveries_order_id_key;

    CREATE UNIQUE INDEX IF NOT EXISTS uq_${schema}_deliveries_order_awb
      ON "${schema}".online_order_deliveries (order_id, awb_number)
      WHERE awb_number IS NOT NULL;
  `);

  // Ensure courier credential and default dimension columns on ecom_settings
  await client.query(`
    ALTER TABLE "${schema}".ecom_settings
      ADD COLUMN IF NOT EXISTS delivery_partner VARCHAR(30) DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS delivery_api_key_enc TEXT,
      ADD COLUMN IF NOT EXISTS delivery_api_secret_enc TEXT,
      ADD COLUMN IF NOT EXISTS delivery_webhook_secret_enc TEXT,
      ADD COLUMN IF NOT EXISTS pickup_location_code VARCHAR(100),
      ADD COLUMN IF NOT EXISTS default_length_cm NUMERIC(10,2) DEFAULT 10.00,
      ADD COLUMN IF NOT EXISTS default_width_cm NUMERIC(10,2) DEFAULT 10.00,
      ADD COLUMN IF NOT EXISTS default_height_cm NUMERIC(10,2) DEFAULT 10.00,
      ADD COLUMN IF NOT EXISTS default_weight_grams NUMERIC(10,2) DEFAULT 500.00;
  `);

  // 2. Shipping Zones Table
  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".shipping_zones (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      zone_type VARCHAR(50) NOT NULL, -- 'INTRA_CITY', 'INTRA_STATE', 'INTER_STATE', 'REMOTE_SPECIAL'
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_shipping_zones_type
      ON "${schema}".shipping_zones(zone_type);
  `);

  // 3. Shipping Zone Pincodes Table
  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".shipping_zone_pincodes (
      id SERIAL PRIMARY KEY,
      zone_id INTEGER NOT NULL REFERENCES "${schema}".shipping_zones(id) ON DELETE CASCADE,
      pincode VARCHAR(20) NOT NULL,
      state VARCHAR(100),
      city VARCHAR(100),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_${schema}_zone_pincode UNIQUE (zone_id, pincode)
    );

    CREATE INDEX IF NOT EXISTS idx_shipping_zone_pincodes_pincode
      ON "${schema}".shipping_zone_pincodes(pincode);
  `);

  // 4. Shipping Rate Rules Table
  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".shipping_rate_rules (
      id SERIAL PRIMARY KEY,
      zone_id INTEGER NOT NULL REFERENCES "${schema}".shipping_zones(id) ON DELETE CASCADE,
      min_weight_grams NUMERIC(10,2) NOT NULL DEFAULT 0,
      max_weight_grams NUMERIC(10,2),
      min_order_value NUMERIC(12,2) NOT NULL DEFAULT 0,
      max_order_value NUMERIC(12,2),
      base_charge NUMERIC(10,2) NOT NULL DEFAULT 0,
      incremental_weight_grams NUMERIC(10,2) NOT NULL DEFAULT 500,
      incremental_charge NUMERIC(10,2) NOT NULL DEFAULT 0,
      is_free_shipping BOOLEAN NOT NULL DEFAULT false,
      min_delivery_days INTEGER NOT NULL DEFAULT 2,
      max_delivery_days INTEGER NOT NULL DEFAULT 5,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_shipping_rate_rules_zone
      ON "${schema}".shipping_rate_rules(zone_id);
  `);

  // 5. Order Returns Table (Reverse Logistics)
  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".order_returns (
      id SERIAL PRIMARY KEY,
      order_id BIGINT NOT NULL REFERENCES "${schema}".online_orders(id) ON DELETE CASCADE,
      customer_id BIGINT REFERENCES "${schema}".customers(id) ON DELETE SET NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'requested', 
      -- 'requested', 'approved', 'rejected', 'pickup_scheduled', 'picked_up', 'in_transit', 'received', 'qc_passed', 'qc_failed', 'refunded', 'cancelled'
      return_reason VARCHAR(100) NOT NULL,
      customer_notes TEXT,
      admin_notes TEXT,
      qc_notes TEXT,
      return_awb VARCHAR(100),
      pickup_scheduled_at TIMESTAMPTZ,
      refund_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      refund_id TEXT,
      refund_status VARCHAR(50) NOT NULL DEFAULT 'pending',
      items JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_order_returns_order_id
      ON "${schema}".order_returns(order_id);
    CREATE INDEX IF NOT EXISTS idx_order_returns_status
      ON "${schema}".order_returns(status);
  `);

  // 6. Seed default zones & rate rules if shipping_zones is empty
  const countRes = await client.query(`SELECT COUNT(*) FROM "${schema}".shipping_zones`);
  if (parseInt(countRes.rows[0]?.count || "0", 10) === 0) {
    const zones = [
      { name: "Intra-City Local", type: "INTRA_CITY", base: 40, inc: 15, minDays: 1, maxDays: 2 },
      { name: "Intra-State", type: "INTRA_STATE", base: 60, inc: 25, minDays: 2, maxDays: 3 },
      { name: "Inter-State Metro & National", type: "INTER_STATE", base: 90, inc: 40, minDays: 3, maxDays: 5 },
      { name: "Special / Remote Regions", type: "REMOTE_SPECIAL", base: 150, inc: 60, minDays: 5, maxDays: 8 },
    ];

    for (const z of zones) {
      const zRes = await client.query(
        `INSERT INTO "${schema}".shipping_zones (name, zone_type, is_active)
         VALUES ($1, $2, true)
         RETURNING id`,
        [z.name, z.type]
      );
      const zoneId = zRes.rows[0].id;

      // Seed rate rule
      await client.query(
        `INSERT INTO "${schema}".shipping_rate_rules (
           zone_id, min_weight_grams, max_weight_grams, min_order_value,
           base_charge, incremental_weight_grams, incremental_charge,
           min_delivery_days, max_delivery_days, is_active
         )
         VALUES ($1, 0, NULL, 0, $2, 500, $3, $4, $5, true)`,
        [zoneId, z.base, z.inc, z.minDays, z.maxDays]
      );

      // Seed sample pincodes
      if (z.type === "INTRA_CITY") {
        await client.query(`
          INSERT INTO "${schema}".shipping_zone_pincodes (zone_id, pincode, state, city)
          VALUES 
            (${zoneId}, '600001', 'Tamil Nadu', 'Chennai'),
            (${zoneId}, '600002', 'Tamil Nadu', 'Chennai'),
            (${zoneId}, '600017', 'Tamil Nadu', 'Chennai'),
            (${zoneId}, '600028', 'Tamil Nadu', 'Chennai')
          ON CONFLICT DO NOTHING;
        `);
      } else if (z.type === "INTRA_STATE") {
        await client.query(`
          INSERT INTO "${schema}".shipping_zone_pincodes (zone_id, pincode, state, city)
          VALUES 
            (${zoneId}, '641001', 'Tamil Nadu', 'Coimbatore'),
            (${zoneId}, '625001', 'Tamil Nadu', 'Madurai'),
            (${zoneId}, '620001', 'Tamil Nadu', 'Tiruchirappalli')
          ON CONFLICT DO NOTHING;
        `);
      } else if (z.type === "INTER_STATE") {
        await client.query(`
          INSERT INTO "${schema}".shipping_zone_pincodes (zone_id, pincode, state, city)
          VALUES 
            (${zoneId}, '560001', 'Karnataka', 'Bengaluru'),
            (${zoneId}, '400001', 'Maharashtra', 'Mumbai'),
            (${zoneId}, '110001', 'Delhi', 'New Delhi'),
            (${zoneId}, '500001', 'Telangana', 'Hyderabad')
          ON CONFLICT DO NOTHING;
        `);
      } else if (z.type === "REMOTE_SPECIAL") {
        await client.query(`
          INSERT INTO "${schema}".shipping_zone_pincodes (zone_id, pincode, state, city)
          VALUES 
            (${zoneId}, '190001', 'Jammu & Kashmir', 'Srinagar'),
            (${zoneId}, '795001', 'Manipur', 'Imphal'),
            (${zoneId}, '737101', 'Sikkim', 'Gangtok'),
            (${zoneId}, '744101', 'Andaman & Nicobar', 'Port Blair')
          ON CONFLICT DO NOTHING;
        `);
      }
    }
  }
}

