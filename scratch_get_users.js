const { Pool } = require("pg");
const pool = new Pool({
  connectionString: "postgresql://postgres:admin123@localhost:5432/e_commerce"
});

async function main() {
  const res = await pool.query("SELECT id, name, email, company_id FROM public.users");
  console.log("Users:", res.rows);
  const comp = await pool.query("SELECT id, company_name, subdomain_url FROM public.companies");
  console.log("Companies:", comp.rows);
  process.exit(0);
}
main().catch(console.error);
