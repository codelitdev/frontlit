import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { makeTestDb, seedTeam, type TestDb } from "../test/db";
import { documents, integrations } from "./schema";

/**
 * 0015_changelog_cleanup removes the product-update GitHub import's stored
 * tokens and normalizes changelog meta. The test database already applied it
 * to an empty schema; re-run its statements against seeded legacy rows.
 */
const MIGRATION = readFileSync(
  path.resolve(process.cwd(), "drizzle/0015_changelog_cleanup.sql"),
  "utf8",
);

async function runMigration(db: TestDb) {
  for (const statement of MIGRATION.split("--> statement-breakpoint")) {
    if (statement.trim()) await db.execute(sql.raw(statement));
  }
}

describe("0015_changelog_cleanup migration", () => {
  let db: TestDb;
  let teamId: string;

  beforeEach(async () => {
    db = await makeTestDb();
    teamId = (await seedTeam(db)).team.id;
  });

  it("deletes only the changelog GitHub token rows", async () => {
    // "github" is no longer a valid provider in the schema; legacy rows exist in the DB only.
    await db.execute(
      sql`INSERT INTO integrations (id, team_id, provider, config) VALUES
        ('gh', ${teamId}, 'github', '{"repo":"o/r","token":"enc"}'::jsonb),
        ('sl', ${teamId}, 'sendlit', '{"apiKey":"enc"}'::jsonb)`,
    );

    await runMigration(db);

    const rows = await db.select().from(integrations);
    expect(rows.map((row) => row.provider)).toEqual(["sendlit"]);
  });

  it("normalizes changelog labels, release dates and drops GitHub meta", async () => {
    const legacy = {
      version: "v1.0.0",
      labels: ["improved", "prerelease", "fixed", "changed"],
      releaseDate: "2026-03-04T10:20:30Z",
      github: { releaseId: 1, releaseUrl: "https://github.com/o/r", tagName: "v1.0.0" },
      indexable: false,
    };
    await db.insert(documents).values([
      {
        teamId,
        kind: "changelog",
        slug: "legacy",
        draftTitle: "Legacy",
        draftContent: { type: "doc", content: [] },
        meta: legacy,
        draftMeta: { ...legacy, releaseDate: "not a date" },
      },
      {
        teamId,
        kind: "blog",
        slug: "post",
        draftTitle: "Post",
        draftContent: { type: "doc", content: [] },
        meta: { labels: ["improved"], github: { releaseId: 2 } },
      },
    ]);

    await runMigration(db);

    const [changelog] = await db
      .select()
      .from(documents)
      .where(eq(documents.slug, "legacy"));
    expect(changelog.meta).toEqual({
      version: "v1.0.0",
      labels: ["changed", "fixed"],
      releaseDate: "2026-03-04",
      indexable: false,
    });
    expect(changelog.draftMeta).toEqual({
      version: "v1.0.0",
      labels: ["changed", "fixed"],
      indexable: false,
    });

    const [blog] = await db.select().from(documents).where(eq(documents.slug, "post"));
    expect(blog.meta).toEqual({ labels: ["improved"], github: { releaseId: 2 } });
  });
});
