import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb, seedTeam, type TestDb } from "../../test/db";
vi.mock("../../db/client", async () => ({ db: await makeTestDb() }));
import { db as appDb } from "../../db/client";
import {
  documentationGitBindings as bindings,
  documentationGitChecks as checks,
  documentationGitJobs as jobs,
  documentationSettings as settings,
  documentationPublications as publications,
} from "../../db/schema";
import { lockSettings } from "../authoring";
import {
  enqueueGitPublicationCheck,
  reconcileGitPublicationChecks,
} from "./publication-checks";
import { processGitCheck } from "./check-worker";
import { getGitCheck, listGitChecks } from "./check-reports";
import { documentationGitCheckSchema } from "@frontlit/api-contract";
import {
  GitHubDocsError,
  type DocsGitHubApp,
  type GitDocsCheckInput,
  type GitDocsCheckRun,
  type GitWriteGuard,
} from "./app";
const db = appDb as unknown as TestDb;
const commitSha = "a".repeat(40);
async function fixture(status: "active" | "failed" | "superseded" = "active") {
  const { team, account } = await seedTeam(db);
  const policy = await db.transaction((tx) => lockSettings(tx, team.id));
  await db.update(settings).set({ source: "git" }).where(eq(settings.teamId, team.id));
  await db.insert(bindings).values({
    teamId: team.id,
    installationId: "7",
    repositoryId: "9",
    ownerId: "8",
    ownerLogin: "org",
    repositoryName: "docs",
    repositoryPrivate: true,
    branch: "main",
    directory: "docs",
    status: "connected",
    grantActorAccountId: account.id,
    grantGithubUserId: "123",
    repositoryAdminVerified: true,
    capabilities: { read: true, proposals: false, directCommit: false },
  });
  const [publication] = await db
    .insert(publications)
    .values({
      teamId: team.id,
      idempotencyKey: "publication",
      inputHash: "immutable",
      source: "git",
      generation: 1,
      docsDraftVersion: policy.draftVersion,
      purgeGeneration: policy.purgeGeneration,
      indexing: { enabled: false },
      navigation: [],
      status: status === "active" ? "active" : "failed",
    })
    .returning();
  await db
    .update(settings)
    .set({ activePublicationId: publication.publicationId })
    .where(eq(settings.teamId, team.id));
  const [sync] = await db
    .insert(jobs)
    .values({
      teamId: team.id,
      connectionGeneration: 1,
      requestGeneration: 1,
      observedSha: commitSha,
      publicationId: status === "active" ? publication.publicationId : null,
      status,
      finishedAt: new Date(),
      diagnostic: status === "failed" ? "INVALID_DOCUMENT" : null,
    })
    .returning();
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
    findCheckRun: vi.fn(async () => remote.run),
    createCheckRun: vi.fn(
      async (
        _t: string,
        _o: string,
        _n: string,
        _input: GitDocsCheckInput,
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
        _t: string,
        _o: string,
        _n: string,
        input: { conclusion?: string; output: GitDocsCheckInput["output"] },
        guard: GitWriteGuard,
      ) => {
        await guard();
        remote.run = {
          ...remote.run!,
          status: input.conclusion ? "completed" : "in_progress",
          conclusion: input.conclusion ?? null,
          annotationsCount:
            remote.run!.annotationsCount + (input.output.annotations?.length ?? 0),
        };
        return remote.run;
      },
    ),
  };
  return {
    teamId: team.id,
    publication,
    sync,
    policy,
    app,
    remote,
    process: () =>
      processGitCheck(
        team.id,
        app as unknown as DocsGitHubApp,
        "http://localhost:3000",
      ),
  };
}
describe("independent publishing-branch checks", () => {
  it("recovers a missed enqueue and reports a successful empty publication exactly once", async () => {
    const f = await fixture();
    expect(await reconcileGitPublicationChecks(f.teamId)).toBe(1);
    expect(await reconcileGitPublicationChecks(f.teamId)).toBe(0);
    expect(await f.process()).toMatchObject({
      status: "delivered",
      checkRunId: 110863307525,
      publicationResult: {
        outcome: "published",
        commitSha,
        publishedCount: 0,
      },
    });
    expect(f.app.createCheckRun.mock.calls[0]![3]).toMatchObject({
      name: "FrontLit / docs publication",
      headSha: commitSha,
    });
    expect(f.remote.run?.conclusion).toBe("success");
    expect(await f.process()).toBeNull();
    expect(f.app.createCheckRun).toHaveBeenCalledTimes(1);
    await db.insert(jobs).values({
      teamId: f.teamId,
      connectionGeneration: 1,
      requestGeneration: 2,
      trigger: "reconcile",
      observedSha: commitSha,
      publicationId: f.publication.publicationId,
      status: "active",
      finishedAt: new Date(),
    });
    expect(await reconcileGitPublicationChecks(f.teamId)).toBe(0);
  });
  it("retains publication truth through lost delivery responses and keeps the live publication unchanged", async () => {
    const f = await fixture();
    const check = await enqueueGitPublicationCheck(f.teamId, f.sync.runId);
    f.remote.loseResponse = true;
    expect(await f.process()).toMatchObject({
      status: "reporting",
      errorPhase: "delivery",
      lastError: "GITHUB_UNAVAILABLE",
      publicationResult: { outcome: "published" },
    });
    await db
      .update(checks)
      .set({ nextAttemptAt: new Date(0) })
      .where(eq(checks.checkId, check.checkId));
    expect(await f.process()).toMatchObject({ status: "delivered" });
    expect(f.app.createCheckRun).toHaveBeenCalledTimes(1);
    expect(
      await db.query.documentationSettings.findFirst({
        where: eq(settings.teamId, f.teamId),
      }),
    ).toMatchObject({ activePublicationId: f.publication.publicationId });
    expect(
      await db.query.documentationPublications.findMany({
        where: eq(publications.teamId, f.teamId),
      }),
    ).toHaveLength(1);
  });
  it("reports failed attempted commits without posting private diagnostic prose", async () => {
    const f = await fixture("failed");
    await db
      .update(publications)
      .set({
        diagnostics: [
          {
            code: "DUPLICATE_ROUTE",
            message: "Private retained diagnostic text",
            file: "docs/guide.md",
            line: 4,
            severity: "error",
            blocksSave: false,
            blocksPublish: true,
          },
        ],
      })
      .where(eq(publications.publicationId, f.publication.publicationId));
    await db
      .update(jobs)
      .set({ publicationId: f.publication.publicationId })
      .where(eq(jobs.runId, f.sync.runId));
    const check = await enqueueGitPublicationCheck(f.teamId, f.sync.runId);
    expect(
      documentationGitCheckSchema.parse(await getGitCheck(f.teamId, check.checkId)),
    ).toMatchObject({
      kind: "publication",
      pullRequestNumber: null,
      publicationResult: {
        outcome: "failed",
        diagnostics: [{ message: "Private retained diagnostic text" }],
      },
    });
    expect(await f.process()).toMatchObject({ status: "delivered" });
    expect(f.remote.run?.conclusion).toBe("failure");
    expect(f.remote.run?.annotationsCount).toBe(1);
    expect(f.app.updateCheckRun.mock.calls[0]![3].output.annotations).toEqual([
      {
        path: "docs/guide.md",
        start_line: 4,
        end_line: 4,
        annotation_level: "failure",
        message: "DUPLICATE_ROUTE",
      },
    ]);
    expect(f.app.createCheckRun.mock.calls[0]![3].output.summary).toContain(
      "DUPLICATE_ROUTE",
    );
    expect(JSON.stringify(f.app.createCheckRun.mock.calls)).not.toContain(
      "Private retained diagnostic text",
    );
    expect(
      (await listGitChecks(f.teamId)).items[0]?.publicationResult?.diagnostics,
    ).toEqual([]);
    await db
      .update(settings)
      .set({ policyEpoch: f.policy.policyEpoch + 1 })
      .where(eq(settings.teamId, f.teamId));
    expect(await getGitCheck(f.teamId, check.checkId)).toMatchObject({
      publicationResult: {
        outcome: "failed",
        redacted: true,
        diagnostics: [],
      },
    });
  });
  it("supersedes after source authority or purge proof changes before delivery", async () => {
    for (const change of ["pause", "purge"] as const) {
      const f = await fixture();
      await enqueueGitPublicationCheck(f.teamId, f.sync.runId);
      if (change === "pause")
        await db
          .update(bindings)
          .set({ status: "paused", generation: 2 })
          .where(eq(bindings.teamId, f.teamId));
      else
        await db
          .update(settings)
          .set({ purgeGeneration: f.policy.purgeGeneration + 1 })
          .where(eq(settings.teamId, f.teamId));
      expect(await f.process()).toMatchObject({ status: "superseded" });
      expect(f.app.createCheckRun).not.toHaveBeenCalled();
    }
  });
  it("does not treat a queued import as a successful publication", async () => {
    const f = await fixture();
    await db
      .update(jobs)
      .set({ status: "preparing" })
      .where(eq(jobs.runId, f.sync.runId));
    expect(await reconcileGitPublicationChecks(f.teamId)).toBe(0);
    await expect(
      enqueueGitPublicationCheck(f.teamId, f.sync.runId),
    ).rejects.toMatchObject({ code: "GITHUB_SUPERSEDED" });
  });
  it("rechecks authority immediately before a remote check mutation", async () => {
    const f = await fixture();
    await enqueueGitPublicationCheck(f.teamId, f.sync.runId);
    const create = f.app.createCheckRun.getMockImplementation()!;
    f.app.createCheckRun.mockImplementation(async (...args) => {
      await db
        .update(bindings)
        .set({ status: "paused", generation: 2 })
        .where(eq(bindings.teamId, f.teamId));
      return create(...args);
    });
    expect(await f.process()).toMatchObject({ status: "superseded" });
    expect(f.remote.run).toBeNull();
    expect(f.app.updateCheckRun).not.toHaveBeenCalled();
  });
  it("honors provider backoff without retrying publication preparation", async () => {
    const f = await fixture();
    const check = await enqueueGitPublicationCheck(f.teamId, f.sync.runId);
    const retryAt = new Date(Date.now() + 2 * 60 * 60_000);
    f.app.installationToken.mockRejectedValue(
      new GitHubDocsError("GITHUB_RATE_LIMITED", 429, retryAt),
    );
    expect(await f.process()).toMatchObject({
      status: "reporting",
      errorPhase: "delivery",
      nextAttemptAt: retryAt,
      publicationResult: { outcome: "published" },
    });
    expect(await f.process()).toBeNull();
    expect(
      await db.query.documentationGitJobs.findFirst({
        where: eq(jobs.runId, f.sync.runId),
      }),
    ).toMatchObject({ status: "active" });
    expect(await getGitCheck(f.teamId, check.checkId)).toMatchObject({
      publicationResult: { outcome: "published" },
    });
  });
});
