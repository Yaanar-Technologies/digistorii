import { resolve } from "path";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function migratePurchaseHeaderAddress() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    console.log("Starting migration for purchase_header bill_to and ship_to...");

    // Get all schemas belonging to companies
    const res = await client.query(`
      SELECT schema_name 
      FROM public.companies 
      WHERE schema_name IS NOT NULL
    `);

    for (const row of res.rows) {
      const schema = row.schema_name;
      console.log(`Migrating schema: ${schema}`);

      // Check if table exists
      const tableCheck = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = $1 
          AND table_name = 'purchase_header'
        )
      `, [schema]);

      if (tableCheck.rows[0].exists) {
        // 1. Add temporary text columns
        await client.query(`
          ALTER TABLE "${schema}".purchase_header 
          ADD COLUMN IF NOT EXISTS bill_to_text TEXT,
          ADD COLUMN IF NOT EXISTS ship_to_text TEXT
        `);

        // 2. Populate text columns from suppliers table
        await client.query(`
          UPDATE "${schema}".purchase_header ph
          SET 
            bill_to_text = CONCAT_WS(', ', 
              bt.address_line1, bt.address_line2, bt.address_line3, 
              bt.city, bt.state, bt.pincode),
            ship_to_text = CONCAT_WS(', ', 
              st.address_line1, st.address_line2, st.address_line3, 
              st.city, st.state, st.pincode)
          FROM "${schema}".purchase_header ph2
          LEFT JOIN "${schema}".suppliers bt ON ph2.bill_to = bt.id
          LEFT JOIN "${schema}".suppliers st ON ph2.ship_to = st.id
          WHERE ph.id = ph2.id
        `);

        // 3. Drop old BIGINT columns and rename temporary ones
        await client.query(`
          ALTER TABLE "${schema}".purchase_header 
          DROP COLUMN bill_to,
          DROP COLUMN ship_to;

          ALTER TABLE "${schema}".purchase_header 
          RENAME COLUMN bill_to_text TO bill_to;

          ALTER TABLE "${schema}".purchase_header 
          RENAME COLUMN ship_to_text TO ship_to;
        `);

        console.log(`Successfully migrated purchase_header in ${schema}`);
      } else {
        console.log(`Table purchase_header does not exist in ${schema}, skipping...`);
      }
    }

    await client.query("COMMIT");
    console.log("Migration completed successfully.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", err);
  } finally {
    client.release();
    pool.end();
  }
}

migratePurchaseHeaderAddress();
