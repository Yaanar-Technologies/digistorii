import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

async function main() {
  const { pool } = await import("../src/lib/db");
  const { ensureLogisticsSchema } = await import("../src/lib/logisticsSchema");

  const client = await pool.connect();
  try {
    const schemasRes = await client.query(`
      SELECT schema_name FROM public.companies WHERE schema_name IS NOT NULL
    `);

    for (const row of schemasRes.rows) {
      const s = row.schema_name;
      console.log(`Migrating Phase 6 Logistics for schema: ${s}...`);
      await ensureLogisticsSchema(client, s);
      console.log(`Successfully migrated Phase 6 Logistics for schema: ${s}`);
    }
  } catch (err) {
    console.error("Migration error:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
