import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./client";

async function main() {
    await migrate(db, {
        migrationsFolder: process.env.MIGRATIONS_FOLDER || "./drizzle",
    });
    await pool.end();
    // CLI success output for operators running migrations manually.
    // eslint-disable-next-line no-console
    console.log("Migrations applied.");
}

main().catch((error) => {
    console.error("Migration failed", error);
    process.exit(1);
});
