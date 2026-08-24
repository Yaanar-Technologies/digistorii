// import { Pool, types } from "pg";

// export const pool = new Pool({
//   connectionString: process.env.DATABASE_URL,
// });

// types.setTypeParser(1082, (val: string) => val);


import { Pool, types } from "pg";
import { ensureDB } from "./ensure-db"

const isLocal = process.env.DATABASE_URL?.includes("localhost") || process.env.DATABASE_URL?.includes("127.0.0.1");

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false }
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
