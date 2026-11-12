import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

async function main() {
  const { pool } = await import("../src/lib/db");
  const { ensurePaymentsSchema } = await import("../src/lib/paymentsSchema");

  const client = await pool.connect();
  try {
    const schemasRes = await client.query(`
      SELECT schema_name FROM public.companies WHERE schema_name IS NOT NULL
    `);

    for (const row of schemasRes.rows) {
      const s = row.schema_name;
      console.log(`Migrating Phase 7 Payments & Invoicing for schema: ${s}...`);
      await ensurePaymentsSchema(client, s);
      console.log(`Successfully migrated Phase 7 for schema: ${s}`);
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

