import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb, seedTeam, type TestDb } from "../../test/db";
vi.mock("../../db/client", async () => ({ db: await makeTestDb() }));
import { db as appDb } from "../../db/client";
import {
  documentationGitChecks as checks,
  documentationSettings as settings,
} from "../../db/schema";
import { lockSettings } from "../authoring";
import { getGitCheck, listGitChecks } from "./check-reports";
import { documentationGitCheckSchema } from "@frontlit/api-contract";
const db = appDb as unknown as TestDb;
async function fixture() {
  const { team } = await seedTeam(db);
  const policy = await db.transaction((tx) => lockSettings(tx, team.id));
  const [row] = await db
    .insert(checks)
    .values({
      teamId: team.id,
      connectionGeneration: 1,
      pullRequestNumber: 12,
      status: "reporting",
      leaseToken: "private-lease",
      lastError: "GITHUB_UNAVAILABLE",
      errorPhase: "delivery",
      result: {
        docsDraftVersion: policy.draftVersion,
        policyEpoch: policy.policyEpoch,
        purgeGeneration: policy.purgeGeneration,
        number: 12,
        headSha: "a".repeat(40),
        baseSha: "b".repeat(40),
        mergeSha: "c".repeat(40),
        outcome: "valid",
        fileCount: 1,
        publishedCount: 1,
        diagnostics: [
          {
            code: "TITLE_REPEATED",
            severity: "warning",
            blocksSave: false,
            blocksPublish: false,
            message: "Private diagnostic text",
            file: "docs/guide.md",
          },
        ],
      },
    })
    .returning();
  return { teamId: team.id, row };
}
describe("private current-policy check reports", () => {
  it("keeps validation truth separate from delivery failure and returns no internal worker state", async () => {
    const f = await fixture(),
      report = await getGitCheck(f.teamId, f.row.checkId);
    expect(documentationGitCheckSchema.parse(report)).toMatchObject({
      status: "reporting",
      errorPhase: "delivery",
      result: {
        outcome: "valid",
        redacted: false,
        diagnostics: [{ message: "Private diagnostic text" }],
      },
    });
    expect(JSON.stringify(report)).not.toMatch(
      /private-lease|leaseToken|connectionGeneration|policyEpoch|purgeGeneration/,
    );
    const other = await seedTeam(db);
    for (const id of [f.row.checkId, "gcheck_missing"])
      await expect(getGitCheck(other.team.id, id)).rejects.toMatchObject({
        code: "GITHUB_CHECK_NOT_FOUND",
        status: 404,
      });
  });
  it("redacts stale policy diagnostics", async () => {
    const f = await fixture();
    await db
      .update(settings)
      .set({ policyEpoch: f.row.result!.policyEpoch + 1 })
      .where(eq(settings.teamId, f.teamId));
    expect(await getGitCheck(f.teamId, f.row.checkId)).toMatchObject({
      result: { redacted: true, diagnostics: [], outcome: "valid" },
    });
  });
  it("uses stable tied-timestamp cursors and returns summary lists without diagnostic prose", async () => {
    const f = await fixture(),
      createdAt = new Date("2026-10-01T00:00:00Z");
    await db
      .update(checks)
      .set({ createdAt, status: "delivered" })
      .where(eq(checks.checkId, f.row.checkId));
    for (let number = 13; number <= 15; number++)
      await db.insert(checks).values({
        teamId: f.teamId,
        connectionGeneration: 1,
        pullRequestNumber: number,
        createdAt,
        status: "delivered",
        result: f.row.result,
      });
    const first = await listGitChecks(f.teamId, { limit: 2 });
    const second = await listGitChecks(f.teamId, {
      limit: 2,
      cursor: first.nextCursor,
    });
    expect(
      new Set([...first.items, ...second.items].map((row) => row.checkId)).size,
    ).toBe(4);
    expect(second.nextCursor).toBeNull();
    expect(JSON.stringify([first, second])).not.toContain("Private diagnostic text");
    const other = await seedTeam(db);
    for (const cursor of [f.row.checkId, "gcheck_missing"])
      await expect(listGitChecks(other.team.id, { cursor })).rejects.toMatchObject({
        code: "INVALID_CURSOR",
        status: 400,
      });
    await expect(listGitChecks(f.teamId, { limit: 51 })).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
  });
});
