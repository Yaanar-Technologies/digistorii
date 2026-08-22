import { pool } from "../src/lib/db";

async function main() {
  const client = await pool.connect();
  try {
    console.log("Starting warehouse address migration...");
    
    // Get all schemas from companies table
    const result = await client.query(`SELECT schema_name FROM public.companies`);
    const schemas = result.rows.map(row => row.schema_name);
    
    console.log(`Found ${schemas.length} schemas to process.`);

    for (const schema of schemas) {
      console.log(`Migrating schema: ${schema}`);
      await client.query("BEGIN");
      
      try {
        // Drop address column and add new structured columns
        await client.query(`
          ALTER TABLE "${schema}".warehouses 
            ADD COLUMN IF NOT EXISTS same_as_ship_to BOOLEAN DEFAULT TRUE,
            ADD COLUMN IF NOT EXISTS address_line_1 TEXT,
            ADD COLUMN IF NOT EXISTS address_line_2 TEXT,
            ADD COLUMN IF NOT EXISTS city VARCHAR(100),
            ADD COLUMN IF NOT EXISTS state VARCHAR(100),
            ADD COLUMN IF NOT EXISTS country VARCHAR(100) DEFAULT 'India',
            ADD COLUMN IF NOT EXISTS pincode VARCHAR(10);
        `);

        // Safely drop the address column if it exists
        await client.query(`
          ALTER TABLE "${schema}".warehouses 
            DROP COLUMN IF EXISTS address;
        `);
        
        await client.query("COMMIT");
        console.log(`Successfully migrated schema: ${schema}`);
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`Error migrating schema ${schema}:`, err);
      }
    }
    
    console.log("Migration complete!");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
