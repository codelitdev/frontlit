import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

const dbConnectionString = process.env.DB_CONNECTION_STRING || "";

export const pool = new Pool({ connectionString: dbConnectionString });
export const db = drizzle(pool, { schema });

/** PGlite (used by Vitest) hangs on `db.transaction` / `FOR UPDATE`.
 * Production Postgres must keep real transactions. Tests that swap this
 * module for `makeTestDb()` should leave the flag unset or set it false. */
export const sqlTransactionsEnabled = true;

export async function checkDatabaseConnection() {
  await pool.query("select 1");
}
