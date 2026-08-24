// import { Pool, types } from "pg";

// export const pool = new Pool({
//   connectionString: process.env.DATABASE_URL,
// });

// types.setTypeParser(1082, (val: string) => val);


import { Pool, types } from "pg";
import { ensureDB } from "./ensure-db"

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
export async function query(text: string, params?: any[]) {
  await ensureDB();

  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;

  console.log("executed query", { text, duration, rows: res.rowCount });
  return res;
}

types.setTypeParser(1082, (val: string) => val);