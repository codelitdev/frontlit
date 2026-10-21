import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb, seedTeam, type TestDb } from "../../test/db";
vi.mock("../../db/client", async () => ({ db: await makeTestDb() }));
import { db as appDb } from "../../db/client";
import {
  documentationGitBindings as bindings,
  documentationGitChecks as checks,
} from "../../db/schema";
import { lockSettings } from "../authoring";
import { documentationSettings as settings } from "../../db/schema";
import { reconcileGitPrChecks } from "./check-reconciliation";
import { GitHubDocsError, type DocsGitHubApp } from "./app";
const db = appDb as unknown as TestDb;
const head = "a".repeat(40),
  base = "b".repeat(40),
  merge = "c".repeat(40);
async function fixture() {
  const { team, account } = await seedTeam(db);
  const policy = await db.transaction(async (tx) => {
    const row = await lockSettings(tx, team.id);
    await tx
      .update(settings)
      .set({ source: "git" })
      .where(eq(settings.teamId, team.id));
    return row;
  });
  await db.insert(bindings).values({
    teamId: team.id,
    installationId: "7",
    repositoryId: "9",
    ownerId: "8",
    ownerLogin: "org",
    repositoryName: "docs",
    repositoryPrivate: true,
    branch: "trunk",
    directory: "docs",
    status: "connected",
    grantActorAccountId: account.id,
    grantGithubUserId: "123",
    repositoryAdminVerified: true,
    capabilities: { read: true, proposals: false, directCommit: false },
    nextPrReconcileAt: new Date(0),
  });
  const candidate = {
    number: 12,
    headSha: head,
    baseSha: base,
    mergeSha: merge,
    supported: true,
  };
  const result = {
    docsDraftVersion: policy.draftVersion,
    policyEpoch: policy.policyEpoch,
    purgeGeneration: policy.purgeGeneration,
    number: 12,
    headSha: head,
    baseSha: base,
    mergeSha: merge,
    outcome: "valid" as const,
    fileCount: 1,
    publishedCount: 1,
    diagnostics: [],
  };
  const app = {
    installation: vi.fn().mockResolvedValue({
      id: 7,
      suspended_at: null,
      permissions: { contents: "read", pull_requests: "read" },
    }),
    installationToken: vi.fn().mockResolvedValue({ token: "read-token" }),
    repositoryById: vi.fn().mockResolvedValue({
      id: 9,
      owner: { id: 8, login: "org" },
      name: "docs",
      private: true,
    }),
    openPullRequestCandidates: vi.fn().mockResolvedValue([candidate]),
    branchHead: vi.fn().mockResolvedValue(base),
  };
  const due = () =>
    db
      .update(bindings)
      .set({ nextPrReconcileAt: new Date(0) })
      .where(eq(bindings.teamId, team.id));
  const process = () => reconcileGitPrChecks(app as unknown as DocsGitHubApp, team.id);
  return { teamId: team.id, result, candidate, app, due, process };
}
describe("missed-event PR check reconciliation", () => {
  it("discovers a PR with no stored webhook/report and observes its own independent interval", async () => {
    const f = await fixture();
    expect(await f.process()).toEqual({ sources: 1, queued: 1, failures: 0 });
    expect(await f.process()).toEqual({ sources: 0, queued: 0, failures: 0 });
    expect(
      await db.query.documentationGitChecks.findMany({
        where: eq(checks.teamId, f.teamId),
      }),
    ).toMatchObject([{ pullRequestNumber: 12, status: "queued" }]);
    expect(f.app.openPullRequestCandidates).toHaveBeenCalledTimes(1);
    expect(f.app.installationToken).toHaveBeenLastCalledWith(7, 9, "review");
  });
  it("skips pages-only connections, which have no docs PR checks", async () => {
    const f = await fixture();
    await db
      .update(bindings)
      .set({ docsEnabled: false })
      .where(eq(bindings.teamId, f.teamId));
    expect(await f.process()).toEqual({ sources: 0, queued: 0, failures: 0 });
    expect(f.app.openPullRequestCandidates).not.toHaveBeenCalled();
  });
  it("skips an unchanged delivered proof but queues fresh validation when the base changes", async () => {
    const f = await fixture();
    await db.insert(checks).values({
      teamId: f.teamId,
      connectionGeneration: 1,
      pullRequestNumber: 12,
      status: "delivered",
      result: f.result,
    });
    f.app.openPullRequestCandidates.mockResolvedValue([
      { ...f.candidate, baseSha: "f".repeat(40) },
    ]);
    expect(await f.process()).toEqual({ sources: 1, queued: 0, failures: 0 });
    await f.due();
    f.app.branchHead.mockResolvedValue("d".repeat(40));
    expect(await f.process()).toEqual({ sources: 1, queued: 1, failures: 0 });
    expect(
      await db.query.documentationGitChecks.findMany({
        where: eq(checks.teamId, f.teamId),
      }),
    ).toHaveLength(2);
  });
  it("preserves an active report lease and rate-limit backoff rather than resetting it", async () => {
    const f = await fixture(),
      nextAttemptAt = new Date(Date.now() + 600_000);
    const [job] = await db
      .insert(checks)
      .values({
        teamId: f.teamId,
        connectionGeneration: 1,
        pullRequestNumber: 12,
        status: "reporting",
        result: f.result,
        nextAttemptAt,
        leaseToken: "current-worker",
        leaseExpiresAt: new Date(Date.now() + 60_000),
        lastError: "GITHUB_RATE_LIMITED",
      })
      .returning();
    f.app.openPullRequestCandidates.mockResolvedValue([
      { ...f.candidate, headSha: "d".repeat(40) },
    ]);
    expect(await f.process()).toEqual({ sources: 1, queued: 0, failures: 0 });
    expect(
      await db.query.documentationGitChecks.findFirst({
        where: eq(checks.checkId, job.checkId),
      }),
    ).toMatchObject({
      status: "reporting",
      leaseToken: "current-worker",
      nextAttemptAt,
      lastError: "GITHUB_RATE_LIMITED",
    });
  });
  it("records discovery errors and respects provider retry windows without changing source publication state", async () => {
    const f = await fixture(),
      retryAt = new Date(Date.now() + 2 * 60 * 60_000);
    f.app.openPullRequestCandidates.mockRejectedValue(
      new GitHubDocsError("GITHUB_RATE_LIMITED", 429, retryAt),
    );
    expect(await f.process()).toEqual({ sources: 1, queued: 0, failures: 1 });
    expect(
      await db.query.documentationGitBindings.findFirst({
        where: eq(bindings.teamId, f.teamId),
      }),
    ).toMatchObject({
      status: "connected",
      lastDiagnostic: null,
      lastPrReconcileError: "GITHUB_RATE_LIMITED",
      nextPrReconcileAt: retryAt,
    });
    expect(await f.process()).toEqual({ sources: 0, queued: 0, failures: 0 });
    expect(
      await db.query.documentationGitChecks.findMany({
        where: eq(checks.teamId, f.teamId),
      }),
    ).toHaveLength(0);
  });
  it("cannot queue a stale source after a concurrent pause or use a partial listing as complete", async () => {
    const f = await fixture();
    f.app.openPullRequestCandidates.mockImplementationOnce(async () => {
      await db
        .update(bindings)
        .set({ status: "paused" })
        .where(eq(bindings.teamId, f.teamId));
      return [f.candidate];
    });
    expect(await f.process()).toEqual({ sources: 1, queued: 0, failures: 1 });
    expect(
      await db.query.documentationGitChecks.findMany({
        where: eq(checks.teamId, f.teamId),
      }),
    ).toHaveLength(0);
    await db
      .update(bindings)
      .set({ status: "connected", nextPrReconcileAt: new Date(0) })
      .where(eq(bindings.teamId, f.teamId));
    f.app.openPullRequestCandidates.mockRejectedValue(
      new GitHubDocsError("GITHUB_RECONCILIATION_LIMIT", 409),
    );
    expect(await f.process()).toEqual({ sources: 1, queued: 0, failures: 1 });
    expect(
      await db.query.documentationGitChecks.findMany({
        where: eq(checks.teamId, f.teamId),
      }),
    ).toHaveLength(0);
  });
});
