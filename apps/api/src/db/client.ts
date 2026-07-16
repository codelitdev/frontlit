import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

const dbConnectionString = process.env.DB_CONNECTION_STRING || "";

export const pool = new Pool({ connectionString: dbConnectionString });
export const db = drizzle(pool, { schema });

export async function checkDatabaseConnection() {
    await pool.query("select 1");
}
