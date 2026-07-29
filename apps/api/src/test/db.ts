import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../db/schema";

/**
 * An in-memory Postgres (PGlite) with the real drizzle migrations applied, so
 * tests exercise actual query semantics — unique indexes, CHECK constraints
 * (`publicIdCheck`), FK cascades, jsonb defaults — instead of mocked query
 * builders.
 *
 * Use it from a test file by mocking the app's db client module:
 *
 *   vi.mock("../db/client", async () => {
 *       const { makeTestDb } = await import("../test/db");
 *       return { db: await makeTestDb() };
 *   });
 *
 * Every module that imports `db` from `db/client` (queries, the code under
 * test, and the test itself) then shares this instance.
 */
export type TestDb = Awaited<ReturnType<typeof makeTestDb>>;

export async function makeTestDb() {
    // The `vector` extension (pgvector) ships with PGlite and needs to be
    // loaded explicitly — the real dev/prod Postgres has it via the
    // `pgvector/pgvector:pg16` image instead (architecture.md §6.1).
    const client = new PGlite({ extensions: { vector } });
    const db = drizzle(client, { schema });
    await migrate(db, {
        // Resolved from cwd: tests always run via vitest, whose root (and
        // worker cwd) is this package (`apps/api`).
        migrationsFolder: path.resolve(process.cwd(), "drizzle"),
    });
    return db;
}

/** Deletes all rows from every table, in FK-safe order. Call in `beforeEach`
 * so tests within a file (which share one PGlite instance) stay independent. */
export async function truncateAll(db: TestDb) {
    // teams cascades to pages, themes, api_keys, team_members.
    await db.delete(schema.teams);
    await db.delete(schema.accounts);
}

/** Seeds the minimal object graph most tests need: an account + a team. */
export async function seedTeam(db: TestDb, overrides: { name?: string } = {}) {
    const [account] = await db
        .insert(schema.accounts)
        .values({ email: `owner-${crypto.randomUUID()}@example.com` })
        .returning();
    const [team] = await db
        .insert(schema.teams)
        .values({
            ownerAccountId: account.id,
            name: overrides.name ?? "Test Team",
            subdomain: `team-${crypto.randomUUID().slice(0, 8)}`,
        })
        .returning();
    await db.insert(schema.teamMembers).values({ teamId: team.id, accountId: account.id, role: "owner" });
    return { account, team };
}
