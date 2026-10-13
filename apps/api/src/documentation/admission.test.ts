import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb, seedTeam } from "../test/db";
import {
  documentationPublications as publications,
  documentationGitJobs as jobs,
  rateLimitBuckets as buckets,
} from "../db/schema";
import {
  documentationPrincipal,
  requireDocumentationWorkCapacity,
  reserveDocumentationValidation,
} from "./admission";

describe("shared documentation admission", () => {
  it("counts explicit publication and manual sync together, excluding automatic work and expired admissions", async () => {
    const db = await makeTestDb();
    const { team } = await seedTeam(db);
    const old = new Date(Date.now() - 61 * 60_000);
    await db.insert(publications).values(
      Array.from({ length: 21 }, (_, i) => ({
        teamId: team.id,
        idempotencyKey: `request-${i}`,
        inputHash: "hash",
        source: "editor" as const,
        generation: i,
        purgeGeneration: 0,
        docsDraftVersion: 1,
        indexing: { enabled: false },
        navigation: [],
        admissionType: i === 19 ? ("automatic" as const) : ("explicit" as const),
        createdAt: i === 20 ? old : new Date(),
      })),
    );
    await expect(
      requireDocumentationWorkCapacity(db, team.id),
    ).resolves.toBeUndefined();
    await db.insert(jobs).values({
      teamId: team.id,
      connectionGeneration: 1,
      requestGeneration: 1,
      trigger: "webhook",
    });
    await expect(
      requireDocumentationWorkCapacity(db, team.id),
    ).resolves.toBeUndefined();
    await db.insert(jobs).values({
      teamId: team.id,
      connectionGeneration: 1,
      requestGeneration: 2,
      trigger: "manual",
    });
    await expect(requireDocumentationWorkCapacity(db, team.id)).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "PUBLICATION_RATE_LIMIT" })],
      retryAfter: expect.any(Number),
    });
    const other = await seedTeam(db);
    await expect(
      requireDocumentationWorkCapacity(db, other.team.id),
    ).resolves.toBeUndefined();
  });

  it("serializes simultaneous validation admissions and isolates principals and teams", async () => {
    const db = await makeTestDb();
    const { team, account } = await seedTeam(db);
    const principal = documentationPrincipal({ accountId: account.id })!;
    const reserve = () =>
      db.transaction((tx) => reserveDocumentationValidation(tx, team.id, principal));
    const results = await Promise.allSettled(Array.from({ length: 61 }, reserve));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(60);
    const rejected = results.find(
      (r) => r.status === "rejected",
    ) as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({
      diagnostics: [expect.objectContaining({ code: "VALIDATION_RATE_LIMIT" })],
      retryAfter: expect.any(Number),
    });
    await expect(
      reserveDocumentationValidation(db, team.id, "key:separate-key"),
    ).resolves.toBeUndefined();
    const other = await seedTeam(db);
    await expect(
      reserveDocumentationValidation(db, other.team.id, principal),
    ).resolves.toBeUndefined();
    const rows = await db.query.rateLimitBuckets.findMany();
    const full = rows.find((row) => row.count === 60)!;
    expect(full.key).not.toContain(account.id);
    await db
      .update(buckets)
      .set({ resetAt: new Date(Date.now() - 1) })
      .where(eq(buckets.key, full.key));
    await expect(reserve()).resolves.toBeUndefined();
    expect(
      await db.query.rateLimitBuckets.findFirst({ where: eq(buckets.key, full.key) }),
    ).toMatchObject({ count: 1 });
    expect(documentationPrincipal({ accountId: account.id, apiKeyId: "key-id" })).toBe(
      "key:key-id",
    );
    expect(documentationPrincipal(undefined)).toBeNull();
  });
});
