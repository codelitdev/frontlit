import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb, seedTeam, type TestDb } from "../../test/db";
vi.mock("../../db/client", async () => ({ db: await makeTestDb() }));
vi.mock("./pr-validation", () => ({ validateGitPullRequest: vi.fn() }));
import { db as appDb } from "../../db/client";
import {
  documentationGitBindings as bindings,
  documentationGitChecks as checks,
  documentationSettings as settings,
  documentationPublications as publications,
} from "../../db/schema";
import { lockSettings } from "../authoring";
import { validateGitPullRequest } from "./pr-validation";
import { enqueueGitPrCheck, claimGitCheck, processGitCheck } from "./check-worker";
import {
  GitHubDocsError,
  type DocsGitHubApp,
  type GitDocsCheckRun,
  type GitWriteGuard,
} from "./app";
const db = appDb as unknown as TestDb;
const head = "a".repeat(40),
  base = "b".repeat(40),
  merge = "c".repeat(40);
async function fixture() {
  const { team, account } = await seedTeam(db);
  const version = await db.transaction(async (tx) => {
    const row = await lockSettings(tx, team.id);
    await tx
      .update(settings)
      .set({ source: "git" })
      .where(eq(settings.teamId, team.id));
    return {
      docsDraftVersion: row.draftVersion,
      policyEpoch: row.policyEpoch,
      purgeGeneration: row.purgeGeneration,
    };
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
  });
  const result = {
    ...version,
    number: 12,
    headSha: head,
    baseSha: base,
    mergeSha: merge,
    outcome: "valid" as const,
    fileCount: 1,
    publishedCount: 1,
    diagnostics: [],
  };
  vi.mocked(validateGitPullRequest).mockResolvedValue(result);
  const remote = { run: null as GitDocsCheckRun | null, loseResponse: false };
  const app = {
    installation: vi.fn().mockResolvedValue({
      id: 7,
      suspended_at: null,
      permissions: { contents: "read", checks: "write" },
    }),
    installationToken: vi.fn().mockResolvedValue({ token: "scoped-token" }),
    repositoryById: vi
      .fn()
      .mockResolvedValue({ id: 9, owner: { id: 8, login: "org" }, name: "docs" }),
    pullRequestCandidate: vi.fn().mockResolvedValue({
      number: 12,
      state: "open",
      merged: false,
      headSha: head,
      baseSha: base,
      mergeSha: merge,
    }),
    branchHead: vi.fn().mockResolvedValue(base),
    findCheckRun: vi.fn(async () => remote.run),
    createCheckRun: vi.fn(
      async (
        _token: string,
        _owner: string,
        _name: string,
        _input: unknown,
        guard: GitWriteGuard,
      ) => {
        await guard();
        remote.run = {
          id: 110863307525,
          status: "in_progress",
          conclusion: null,
          annotationsCount: 0,
        };
        if (remote.loseResponse) {
          remote.loseResponse = false;
          throw new GitHubDocsError("GITHUB_UNAVAILABLE");
        }
        return remote.run;
      },
    ),
    updateCheckRun: vi.fn(
      async (
        _token: string,
        _owner: string,
        _name: string,
        input: { conclusion: string },
        guard: GitWriteGuard,
      ) => {
        await guard();
        remote.run = {
          ...remote.run!,
          status: "completed",
          conclusion: input.conclusion,
        };
        return remote.run;
      },
    ),
  };
  const job = await enqueueGitPrCheck(team.id, 12);
  const process = () =>
    processGitCheck(team.id, app as unknown as DocsGitHubApp, "http://localhost:3000");
  return { teamId: team.id, job, result, app, remote, process };
}
beforeEach(() => vi.mocked(validateGitPullRequest).mockReset());
describe("durable independent PR check jobs", () => {
  it("persists merge proof and delivery without creating a publication", async () => {
    const f = await fixture();
    expect(await f.process()).toMatchObject({
      status: "delivered",
      result: f.result,
      checkRunId: 110863307525,
      leaseToken: null,
    });
    expect(await f.process()).toBeNull();
    expect(
      await db.query.documentationPublications.findMany({
        where: eq(publications.teamId, f.teamId),
      }),
    ).toHaveLength(0);
    expect(f.app.installationToken).toHaveBeenCalledWith(7, 9, "checks");
  });
  it("retains validation truth and retries response-lost delivery without validating or creating twice", async () => {
    const f = await fixture();
    f.remote.loseResponse = true;
    expect(await f.process()).toMatchObject({
      status: "reporting",
      result: f.result,
      lastError: "GITHUB_UNAVAILABLE",
      errorPhase: "delivery",
    });
    expect(await f.process()).toBeNull();
    await db
      .update(checks)
      .set({ nextAttemptAt: new Date(0) })
      .where(eq(checks.checkId, f.job.checkId));
    expect(await f.process()).toMatchObject({
      status: "delivered",
      result: f.result,
      lastError: null,
    });
    expect(validateGitPullRequest).toHaveBeenCalledTimes(1);
    expect(f.app.createCheckRun).toHaveBeenCalledTimes(1);
  });
  it("delivers a terminal closed-PR report after the publishing branch advances without requeueing", async () => {
    const f = await fixture();
    vi.mocked(validateGitPullRequest).mockResolvedValue({
      ...f.result,
      outcome: "incomplete",
      diagnostics: [
        {
          code: "GITHUB_PR_CLOSED",
          message: "Closed",
          severity: "error",
          blocksSave: true,
          blocksPublish: true,
        },
      ],
    });
    f.app.pullRequestCandidate.mockResolvedValue({
      number: 12,
      state: "closed",
      merged: true,
      headSha: head,
      baseSha: base,
      mergeSha: merge,
    });
    f.app.branchHead.mockResolvedValue("d".repeat(40));
    expect(await f.process()).toMatchObject({
      status: "delivered",
      checkRunId: 110863307525,
    });
    expect(await f.process()).toBeNull();
    expect(
      await db.query.documentationGitChecks.findMany({
        where: eq(checks.teamId, f.teamId),
      }),
    ).toHaveLength(1);
  });
  it("discards an open-PR result when the PR closes before delivery", async () => {
    const f = await fixture();
    f.app.pullRequestCandidate.mockResolvedValue({
      number: 12,
      state: "closed",
      merged: false,
      headSha: head,
      baseSha: base,
      mergeSha: merge,
    });
    expect(await f.process()).toMatchObject({
      status: "superseded",
      lastError: "GITHUB_PR_CHANGED",
    });
    expect(f.app.createCheckRun).not.toHaveBeenCalled();
  });
  it("delivers a current merge proof despite historical PR base metadata", async () => {
    const f = await fixture();
    f.app.pullRequestCandidate.mockResolvedValue({
      number: 12,
      state: "open",
      merged: false,
      headSha: head,
      baseSha: "f".repeat(40),
      mergeSha: merge,
    });
    expect(await f.process()).toMatchObject({
      status: "delivered",
      checkRunId: 110863307525,
    });
  });
  it("leases once and a newer event invalidates that lease before another result can be saved", async () => {
    const f = await fixture();
    expect(await claimGitCheck(f.teamId)).toMatchObject({ checkId: f.job.checkId });
    expect(await claimGitCheck(f.teamId)).toBeNull();
    const newer = await enqueueGitPrCheck(f.teamId, 12);
    expect(newer.checkId).not.toBe(f.job.checkId);
    expect(
      await db.query.documentationGitChecks.findFirst({
        where: eq(checks.checkId, f.job.checkId),
      }),
    ).toMatchObject({ status: "superseded", leaseToken: null });
  });
  it("does not deliver stale-base results and queues a fresh merge validation", async () => {
    const f = await fixture();
    f.app.branchHead.mockResolvedValue("d".repeat(40));
    expect(await f.process()).toMatchObject({
      status: "superseded",
      lastError: "GITHUB_PR_CHANGED",
      result: f.result,
    });
    expect(f.app.createCheckRun).not.toHaveBeenCalled();
    // A persistent stale provider merge must not cause an immediate hot loop.
    expect(await f.process()).toBeNull();
    expect(
      await db.query.documentationGitChecks.findMany({
        where: eq(checks.teamId, f.teamId),
      }),
    ).toHaveLength(2);
  });
  it("does not create an endless chain when provider merge validation stays stale", async () => {
    const f = await fixture();
    vi.mocked(validateGitPullRequest).mockRejectedValueOnce(
      new GitHubDocsError("GITHUB_PR_CHANGED", 409),
    );
    expect(await f.process()).toMatchObject({
      status: "superseded",
      lastError: "GITHUB_PR_CHANGED",
      errorPhase: "validation",
    });
    expect(await f.process()).toBeNull();
    expect(
      await db.query.documentationGitChecks.findMany({
        where: eq(checks.teamId, f.teamId),
      }),
    ).toHaveLength(1);
    expect(f.app.createCheckRun).not.toHaveBeenCalled();
    // An actual newer event can still admit a fresh validation.
    expect(await enqueueGitPrCheck(f.teamId, 12)).toMatchObject({ status: "queued" });
    expect(
      await db.query.documentationGitChecks.findMany({
        where: eq(checks.teamId, f.teamId),
      }),
    ).toHaveLength(2);
  });
  it("preserves an invalid validation result when check delivery is unavailable", async () => {
    const f = await fixture();
    vi.mocked(validateGitPullRequest).mockResolvedValue({
      ...f.result,
      outcome: "invalid",
      diagnostics: [],
    });
    f.app.installationToken.mockRejectedValue(
      new GitHubDocsError("GITHUB_RATE_LIMITED", 429, new Date(Date.now() + 600_000)),
    );
    expect(await f.process()).toMatchObject({
      status: "reporting",
      result: { outcome: "invalid" },
      errorPhase: "delivery",
      lastError: "GITHUB_RATE_LIMITED",
    });
    expect(await f.process()).toBeNull();
  });
  it("keeps a mergeability wait queued and suppresses delivery after source pause", async () => {
    const f = await fixture();
    vi.mocked(validateGitPullRequest).mockRejectedValueOnce(
      new GitHubDocsError("GITHUB_PR_MERGE_PENDING"),
    );
    expect(await f.process()).toMatchObject({
      status: "queued",
      result: null,
      errorPhase: "validation",
    });
    await db
      .update(checks)
      .set({ nextAttemptAt: new Date(0) })
      .where(eq(checks.checkId, f.job.checkId));
    await db
      .update(bindings)
      .set({ status: "paused" })
      .where(eq(bindings.teamId, f.teamId));
    expect(await f.process()).toMatchObject({
      status: "superseded",
      lastError: "GITHUB_SUPERSEDED",
    });
    expect(f.app.createCheckRun).not.toHaveBeenCalled();
  });
});
