import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb, seedTeam, type TestDb } from "../../test/db";
vi.mock("../../db/client", async () => ({ db: await makeTestDb() }));
vi.mock("./setup", async (original) => ({
  ...(await original<typeof import("./setup")>()),
  verifySetupRepository: vi.fn(),
}));
import { db as appDb } from "../../db/client";
import {
  accounts,
  authUser,
  authSession,
  teamMembers,
  teams,
  documentationSettings,
  documentationGitSetups as setups,
  documentationGitMigrationPrs as requests,
  documentationGitMigrations as migrations,
} from "../../db/schema";
import type { AuthzContext } from "../../auth/authorize";
import { saveDocumentation, getDocsSettings } from "../authoring";
import { authorizedSetup, verifySetupRepository } from "./setup";
import { planGitMigration, getGitMigration, cancelGitMigration } from "./migrations";
import { resolveGitPublisherCredential } from "./publisher";
import { submitGitMigrationPr } from "./migration-prs";
import { GitHubDocsError, type DocsGitHubApp, type GitHubAppConfig } from "./app";
import {
  claimGitMigrationWrite,
  writeGitMigration,
  processGitMigrationWrite,
} from "./migration-write-worker";
import { reconcileGitMigrationPr } from "./migration-reconciliation";
import { receiveGitHubDelivery } from "./webhooks";
import { getGitHubSource } from "./source";

const db = appDb as unknown as TestDb;
const config: GitHubAppConfig = {
  appId: "42",
  appSlug: "test",
  clientId: "client",
  clientSecret: "secret",
  privateKey: "unused",
  callbackUrl: "http://localhost:4000/integrations/github/callback",
  webhookSecret: "secret",
  webOrigin: "http://localhost:3000",
};
const repository = {
  id: 9,
  owner: { id: 8, login: "org" },
  name: "docs",
  private: true,
  default_branch: "main",
};
describe("platform setup PR admission (V46–V48)", () => {
  beforeEach(() => {
    vi.mocked(verifySetupRepository).mockImplementation(
      async (teamId, setupId, actor) => ({
        setup: await authorizedSetup(teamId, setupId, actor),
        repository: repository as any,
        installationToken: "read-fixture-token",
      }),
    );
  });
  afterEach(() => {
    delete process.env.DOCS_RESTORE_PENDING;
  });
  async function fixture(emptyRepository = false, root = "") {
    const { team, account } = await seedTeam(db);
    const userId = crypto.randomUUID(),
      sessionId = crypto.randomUUID(),
      token = crypto.randomUUID();
    await db.insert(authUser).values({
      id: userId,
      name: "Setup admin",
      email: account.email,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db
      .update(accounts)
      .set({ authUserId: userId })
      .where(eq(accounts.id, account.id));
    await db.insert(authSession).values({
      id: sessionId,
      token,
      userId,
      expiresAt: new Date(Date.now() + 3600000),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const actor: AuthzContext = {
      teamId: team.id,
      accountId: account.id,
      authKind: "session",
      isOwner: true,
      permissions: [],
      scopes: [],
      audiences: [],
    };
    const [setup] = await db
      .insert(setups)
      .values({
        teamId: team.id,
        actorAccountId: account.id,
        stateHash: crypto.randomUUID(),
        purpose: "connect",
        returnPath: "/settings/integrations?tab=github",
        status: "authorized",
        encryptedUserToken: "private-fixture-token",
        githubUserId: "123",
        expiresAt: new Date(Date.now() + 600000),
      })
      .returning();
    const doc = (await saveDocumentation(team.id, null, {
      title: "Never published",
      markdown: "Private capture remains local until the worker writes.",
    }))!;
    const settings = await getDocsSettings(team.id);
    const app: any = {
      branchHead: emptyRepository
        ? vi
            .fn()
            .mockRejectedValue(new GitHubDocsError("GITHUB_REFERENCE_UNAVAILABLE", 404))
        : vi.fn().mockResolvedValue("a".repeat(40)),
      repositoryIsEmpty: vi.fn().mockResolvedValue(emptyRepository),
      installation: vi.fn().mockResolvedValue({
        id: 7,
        permissions: { contents: "write", pull_requests: "write" },
      }),
      createProposalTree: vi.fn(),
      createProposalCommit: vi.fn(),
    };
    const plan = await planGitMigration(
      team.id,
      actor,
      {
        setupId: setup.setupId,
        installationId: 7,
        repositoryId: 9,
        branch: "main",
        root,
        expectedDocsDraftVersion: settings.draftVersion,
        expectedPublicationId: null,
      },
      config,
      app,
    );
    const credential = await resolveGitPublisherCredential(actor, {
      cookie: `frontlit.session_token=${token}`,
    });
    const input = {
      setupId: setup.setupId,
      planHash: plan.planHash,
      expectedDocsDraftVersion: plan.docsDraftVersion,
      expectedPublicationId: null,
      acknowledgeExport: true,
      idempotencyKey: crypto.randomUUID(),
      initializeEmptyRepository: emptyRepository,
    };
    const submit = (body: unknown = input) =>
      submitGitMigrationPr(team.id, actor, credential, plan.planId, body, config, app);
    return {
      team,
      account,
      sessionId,
      token,
      actor,
      setup,
      doc,
      plan,
      input,
      app,
      submit,
    };
  }
  async function writingFixture(emptyRepository = false, root = "") {
    const f = await fixture(emptyRepository, root);
    await f.submit();
    const claimed = (await claimGitMigrationWrite(f.team.id))!;
    const base = "a".repeat(40),
      tree = "b".repeat(40),
      commit = "c".repeat(40);
    let branchCreated = false,
      prCreated = false,
      initialized = !emptyRepository;
    const pr = {
      number: 2,
      url: "https://github.com/org/docs/pull/2",
      state: "open",
      merged: false,
      mergeCommitSha: null,
      headSha: commit,
      baseSha: base,
    };
    Object.assign(f.app, {
      installationToken: vi
        .fn()
        .mockResolvedValue({ token: "fixture-installation-token" }),
      repositoryById: vi.fn().mockResolvedValue(repository),
      commit: vi.fn(async (_token, _owner, _name, sha) => ({
        sha,
        tree: { sha: sha === base ? "d".repeat(40) : tree },
        parents: emptyRepository && sha === base ? [] : [{ sha: base }],
        message: `Initialize FrontLit documentation directory\n\nFrontLit setup: ${f.plan.planId}`,
      })),
      tree: vi.fn().mockResolvedValue(
        emptyRepository
          ? [
              {
                path: "docs/.gitkeep",
                type: "blob",
                mode: "100644",
                sha: "e".repeat(40),
              },
            ]
          : [],
      ),
      blob: vi
        .fn()
        .mockResolvedValue(Buffer.from("FrontLit documentation directory.\n")),
      initializeDocsRepository: vi.fn(async (_token, _owner, _name, _input, guard) => {
        await guard();
        initialized = true;
        return base;
      }),
      branchHead: vi.fn(async (_token, _owner, _name, branch) => {
        if (branch === "main" && initialized) return base;
        if (branchCreated) return commit;
        throw new GitHubDocsError("GITHUB_REFERENCE_UNAVAILABLE", 404);
      }),
      createMigrationTree: vi.fn(async (_token, _owner, _name, _input, guard) => {
        await guard();
        return tree;
      }),
      createMigrationCommit: vi.fn(async (_token, _owner, _name, _input, guard) => {
        await guard();
        return commit;
      }),
      createMigrationBranch: vi.fn(
        async (_token, _owner, _name, _plan, _sha, guard) => {
          await guard();
          branchCreated = true;
        },
      ),
      createMigrationPullRequest: vi.fn(
        async (_token, _owner, _name, _input, guard) => {
          await guard();
          prCreated = true;
          return pr;
        },
      ),
      findMigrationPullRequest: vi.fn(async () => (prCreated ? pr : null)),
    });
    return { ...f, claimed, tree, commit };
  }
  it("requires empty-repository disclosure and recovers lost bootstrap acknowledgment before creating its docs PR", async () => {
    const f = await writingFixture(true);
    expect(f.plan.initializeEmptyRepositoryRequired).toBe(true);
    const initialize = f.app.initializeDocsRepository.getMockImplementation();
    f.app.initializeDocsRepository.mockImplementationOnce(
      async (...args: Parameters<DocsGitHubApp["initializeDocsRepository"]>) => {
        await initialize(...args);
        throw new GitHubDocsError("GITHUB_UNAVAILABLE", 503);
      },
    );
    await expect(writeGitMigration(f.claimed, f.app, config)).rejects.toMatchObject({
      code: "GITHUB_UNAVAILABLE",
    });
    await db
      .update(requests)
      .set({ leaseExpiresAt: new Date(0) })
      .where(eq(requests.planId, f.plan.planId));
    const retry = (await claimGitMigrationWrite(f.team.id))!;
    expect(await writeGitMigration(retry, f.app, config)).toMatchObject({
      status: "open",
      bootstrapSha: "a".repeat(40),
      pullRequestNumber: 2,
    });
    expect(f.app.initializeDocsRepository).toHaveBeenCalledTimes(1);
    expect(f.app.createMigrationPullRequest).toHaveBeenCalledTimes(1);
    expect((await getDocsSettings(f.team.id)).source).toBe("editor");
    const other = await fixture(true);
    await expect(
      other.submit({ ...other.input, initializeEmptyRepository: false }),
    ).rejects.toMatchObject({
      code: "GITHUB_REPOSITORY_INITIALIZATION_CONSENT_REQUIRED",
    });
  });
  it("rejects a foreign initial commit during bootstrap recovery", async () => {
    const f = await writingFixture(true);
    f.app.branchHead.mockResolvedValue("a".repeat(40));
    f.app.commit.mockResolvedValueOnce({
      sha: "a".repeat(40),
      message: "Somebody else's initial commit",
      tree: { sha: "d".repeat(40) },
      parents: [],
    });
    await expect(writeGitMigration(f.claimed, f.app, config)).rejects.toMatchObject({
      code: "GITHUB_PROPOSAL_RECOVERY_CONFLICT",
    });
    expect(f.app.initializeDocsRepository).not.toHaveBeenCalled();
    expect(f.app.createMigrationTree).not.toHaveBeenCalled();
  });
  it("reports accepted placeholder initialization after cancellation without creating docs objects", async () => {
    const f = await writingFixture(true);
    const initialize = f.app.initializeDocsRepository.getMockImplementation();
    f.app.initializeDocsRepository.mockImplementationOnce(
      async (...args: Parameters<DocsGitHubApp["initializeDocsRepository"]>) => {
        const sha = await initialize(...args);
        await cancelGitMigration(f.team.id, f.actor, f.plan.planId);
        return sha;
      },
    );
    await expect(writeGitMigration(f.claimed, f.app, config)).rejects.toMatchObject({
      code: "GITHUB_SUPERSEDED",
    });
    expect(
      (await getGitMigration(f.team.id, f.actor, f.plan.planId)).pullRequest,
    ).toMatchObject({
      status: "canceled",
      bootstrapSha: "a".repeat(40),
      commitSha: null,
    });
    expect(f.app.createMigrationTree).not.toHaveBeenCalled();
    expect((await getDocsSettings(f.team.id)).source).toBe("editor");
  });
  it("preserves an existing file occupying a parent of the selected docs directory", async () => {
    const f = await writingFixture(false, "frontlit");
    f.app.tree.mockResolvedValue([
      { path: "frontlit", mode: "100644", type: "blob", sha: "e".repeat(40) },
    ]);
    await expect(writeGitMigration(f.claimed, f.app, config)).rejects.toMatchObject({
      code: "GITHUB_PROPOSAL_RECOVERY_CONFLICT",
    });
    expect(f.app.createMigrationTree).not.toHaveBeenCalled();
    expect(f.app.createMigrationCommit).not.toHaveBeenCalled();
  });
  it("writes the captured setup once and leaves editor ownership/publication unchanged", async () => {
    const f = await writingFixture();
    expect(await claimGitMigrationWrite(f.team.id)).toBeNull();
    const result = await writeGitMigration(f.claimed, f.app, config);
    expect(result).toMatchObject({
      status: "open",
      commitSha: f.commit,
      pullRequestNumber: 2,
      leaseToken: null,
    });
    expect(f.app.createMigrationTree.mock.calls[0][3].files).toEqual(
      f.plan.files.map((file) => ({
        path: file.path,
        content: file.markdown,
      })),
    );
    expect(f.app.createMigrationPullRequest.mock.calls[0][3]).toMatchObject({
      draftCount: 1,
    });
    expect((await getDocsSettings(f.team.id)).source).toBe("editor");
    expect((await getDocsSettings(f.team.id)).activePublicationId).toBeNull();
    expect(await claimGitMigrationWrite(f.team.id)).toBeNull();
    expect(f.app.createMigrationPullRequest).toHaveBeenCalledTimes(1);
  });
  it("discovers only the original manager's active setup without exposing captured bodies", async () => {
    const f = await fixture();
    const source = await getGitHubSource(f.team.id, f.actor);
    expect(source).toMatchObject({
      source: "editor",
      binding: null,
      pendingMigrationId: f.plan.planId,
    });
    expect(JSON.stringify(source)).not.toContain("Private capture remains local");
    expect(
      (
        await getGitHubSource(f.team.id, {
          ...f.actor,
          isOwner: false,
          permissions: ["documentation:read"],
        })
      ).pendingMigrationId,
    ).toBeNull();
    expect(
      (
        await getGitHubSource(f.team.id, {
          ...f.actor,
          authKind: "oauth",
          scopes: ["documentation:read"],
        })
      ).pendingMigrationId,
    ).toBeNull();
    const other = await seedTeam(db);
    expect(
      (await getGitHubSource(f.team.id, { ...f.actor, accountId: other.account.id }))
        .pendingMigrationId,
    ).toBeNull();
    expect(
      (await getGitHubSource(other.team.id, f.actor)).pendingMigrationId,
    ).toBeNull();
    await db
      .update(migrations)
      .set({ expiresAt: new Date(0) })
      .where(eq(migrations.planId, f.plan.planId));
    expect((await getGitHubSource(f.team.id, f.actor)).pendingMigrationId).toBeNull();
  });
  it("records an accepted tree after in-flight cancellation without writing a commit or restoring authority", async () => {
    const f = await writingFixture();
    f.app.createMigrationTree.mockImplementation(
      async (...args: Parameters<DocsGitHubApp["createMigrationTree"]>) => {
        const guard = args[4];
        await guard();
        await cancelGitMigration(f.team.id, f.actor, f.plan.planId);
        return f.tree;
      },
    );
    await expect(writeGitMigration(f.claimed, f.app, config)).rejects.toMatchObject({
      code: "GITHUB_SUPERSEDED",
    });
    expect(
      await db.query.documentationGitMigrationPrs.findFirst({
        where: eq(requests.planId, f.plan.planId),
      }),
    ).toMatchObject({ status: "canceled", treeSha: f.tree, commitSha: null });
    expect(f.app.createMigrationCommit).not.toHaveBeenCalled();
  });
  it("discovers a response-lost PR after lease expiry instead of duplicating Git writes", async () => {
    const f = await writingFixture();
    const accepted = f.app.createMigrationPullRequest.getMockImplementation();
    f.app.createMigrationPullRequest.mockImplementationOnce(
      async (...args: Parameters<DocsGitHubApp["createMigrationPullRequest"]>) => {
        await accepted(...args);
        throw new GitHubDocsError("GITHUB_REQUEST_FAILED", 502);
      },
    );
    await expect(writeGitMigration(f.claimed, f.app, config)).rejects.toMatchObject({
      code: "GITHUB_REQUEST_FAILED",
    });
    expect(
      await db.query.documentationGitMigrationPrs.findFirst({
        where: eq(requests.planId, f.plan.planId),
      }),
    ).toMatchObject({
      status: "writing",
      commitSha: f.commit,
      pullRequestNumber: null,
    });
    await db
      .update(requests)
      .set({ leaseExpiresAt: new Date(0) })
      .where(eq(requests.planId, f.plan.planId));
    const retry = (await claimGitMigrationWrite(f.team.id))!;
    expect(await writeGitMigration(retry, f.app, config)).toMatchObject({
      status: "open",
      pullRequestNumber: 2,
    });
    expect(f.app.createMigrationTree).toHaveBeenCalledTimes(1);
    expect(f.app.createMigrationCommit).toHaveBeenCalledTimes(1);
    expect(f.app.createMigrationBranch).toHaveBeenCalledTimes(1);
    expect(f.app.createMigrationPullRequest).toHaveBeenCalledTimes(1);
  });
  it("schedules transient failures with backoff and exposes terminal authority failures", async () => {
    const f = await writingFixture();
    await db
      .update(requests)
      .set({ leaseExpiresAt: new Date(0) })
      .where(eq(requests.planId, f.plan.planId));
    f.app.tree.mockRejectedValueOnce(new GitHubDocsError("GITHUB_UNAVAILABLE", 503));
    expect(await processGitMigrationWrite(f.team.id, f.app, config)).toMatchObject({
      status: "queued",
      diagnostic: "GITHUB_UNAVAILABLE",
      leaseToken: null,
    });
    expect(await processGitMigrationWrite(f.team.id, f.app, config)).toBeNull();
    await db
      .update(requests)
      .set({ nextAttemptAt: new Date(0) })
      .where(eq(requests.planId, f.plan.planId));
    await db.delete(authSession).where(eq(authSession.id, f.sessionId));
    expect(await processGitMigrationWrite(f.team.id, f.app, config)).toMatchObject({
      status: "failed",
      diagnostic: "GITHUB_PUBLISHER_REVOKED",
      leaseToken: null,
    });
    expect(await processGitMigrationWrite(f.team.id, f.app, config)).toBeNull();
  });
  it("reconciles merge truth after setup expiry without activating editor content", async () => {
    const f = await writingFixture();
    await writeGitMigration(f.claimed, f.app, config);
    await db
      .update(setups)
      .set({ expiresAt: new Date(0) })
      .where(eq(setups.setupId, f.setup.setupId));
    f.app.findMigrationPullRequest.mockResolvedValue({
      number: 2,
      url: "https://github.com/org/docs/pull/2",
      state: "closed",
      merged: true,
      mergeCommitSha: "e".repeat(40),
      headSha: f.commit,
      baseSha: "a".repeat(40),
    });
    expect(await reconcileGitMigrationPr(f.team.id, f.app)).toMatchObject({
      status: "merged",
      mergedCommitSha: "e".repeat(40),
    });
    expect(f.app.installationToken).toHaveBeenLastCalledWith(7, 9, "review");
    expect((await getDocsSettings(f.team.id)).source).toBe("editor");
    expect(await reconcileGitMigrationPr(f.team.id, f.app)).toBeNull();
    expect(f.app.createMigrationPullRequest).toHaveBeenCalledTimes(1);
  });
  it("uses matching signed-delivery metadata to wake polling and rejects foreign PR identity", async () => {
    const f = await writingFixture();
    await writeGitMigration(f.claimed, f.app, config);
    await db
      .update(requests)
      .set({ nextAttemptAt: new Date(Date.now() + 600000) })
      .where(eq(requests.planId, f.plan.planId));
    const payload = {
      installation: { id: 7 },
      repository: { id: 9 },
      action: "closed",
      pull_request: {
        number: 2,
        merged: true,
        base: { ref: "main", repo: { id: 9 } },
        head: { ref: `frontlit/docs-setup/${f.plan.planId}`, repo: { id: 9 } },
      },
    };
    expect(
      await receiveGitHubDelivery(crypto.randomUUID(), "pull_request", payload),
    ).toMatchObject({ relevant: true });
    await db
      .update(requests)
      .set({ nextAttemptAt: new Date(Date.now() + 600000) })
      .where(eq(requests.planId, f.plan.planId));
    expect(
      await receiveGitHubDelivery(crypto.randomUUID(), "push", {
        installation: { id: 7 },
        repository: { id: 9 },
        ref: "refs/heads/main",
        deleted: false,
      }),
    ).toMatchObject({ relevant: true });
    f.app.findMigrationPullRequest.mockResolvedValue({
      number: 99,
      state: "closed",
      merged: true,
      mergeCommitSha: "e".repeat(40),
      headSha: f.commit,
    });
    expect(await reconcileGitMigrationPr(f.team.id, f.app)).toMatchObject({
      status: "open",
      diagnostic: "GITHUB_PROPOSAL_RECOVERY_CONFLICT",
    });
    expect(await reconcileGitMigrationPr(f.team.id, f.app)).toBeNull();
  });
  it("keeps closed-unmerged and canceled-in-flight setups editor-owned", async () => {
    const f = await writingFixture();
    await writeGitMigration(f.claimed, f.app, config);
    f.app.findMigrationPullRequest.mockResolvedValue({
      number: 2,
      state: "closed",
      merged: false,
      mergeCommitSha: null,
      headSha: f.commit,
    });
    expect(await reconcileGitMigrationPr(f.team.id, f.app)).toMatchObject({
      status: "closed",
      mergedCommitSha: null,
    });
    expect((await getDocsSettings(f.team.id)).source).toBe("editor");
    const other = await writingFixture();
    await writeGitMigration(other.claimed, other.app, config);
    other.app.findMigrationPullRequest.mockImplementation(async () => {
      await cancelGitMigration(other.team.id, other.actor, other.plan.planId);
      return {
        number: 2,
        state: "closed",
        merged: true,
        mergeCommitSha: "e".repeat(40),
        headSha: other.commit,
      };
    });
    expect(await reconcileGitMigrationPr(other.team.id, other.app)).toBeNull();
    expect(
      await db.query.documentationGitMigrationPrs.findFirst({
        where: eq(requests.planId, other.plan.planId),
      }),
    ).toMatchObject({ status: "canceled", mergedCommitSha: null });
    expect((await getDocsSettings(other.team.id)).source).toBe("editor");
  });
  it("rejects merge observation when the submitting session is revoked during the provider read", async () => {
    const f = await writingFixture();
    await writeGitMigration(f.claimed, f.app, config);
    f.app.findMigrationPullRequest.mockImplementation(async () => {
      await db.delete(authSession).where(eq(authSession.id, f.sessionId));
      return {
        number: 2,
        state: "closed",
        merged: true,
        mergeCommitSha: "e".repeat(40),
        headSha: f.commit,
      };
    });
    expect(await reconcileGitMigrationPr(f.team.id, f.app)).toMatchObject({
      status: "open",
      diagnostic: "GITHUB_PUBLISHER_REVOKED",
      mergedCommitSha: null,
      pullRequestNumber: 2,
      commitSha: f.commit,
    });
    expect((await getDocsSettings(f.team.id)).source).toBe("editor");
  });
  it("rejects a merge result after the workspace policy changes during the provider read", async () => {
    const f = await writingFixture();
    await writeGitMigration(f.claimed, f.app, config);
    const settings = await getDocsSettings(f.team.id);
    f.app.findMigrationPullRequest.mockImplementation(async () => {
      await db
        .update(documentationSettings)
        .set({ policyEpoch: settings.policyEpoch + 1 })
        .where(eq(documentationSettings.teamId, f.team.id));
      return {
        number: 2,
        state: "closed",
        merged: true,
        mergeCommitSha: "e".repeat(40),
        headSha: f.commit,
      };
    });
    expect(await reconcileGitMigrationPr(f.team.id, f.app)).toMatchObject({
      status: "open",
      diagnostic: "MIGRATION_STALE",
      mergedCommitSha: null,
    });
    expect((await getDocsSettings(f.team.id)).source).toBe("editor");
  });
  it("retains the setup PR during provider backoff and reconciles the same PR after recovery", async () => {
    const f = await writingFixture();
    await writeGitMigration(f.claimed, f.app, config);
    const retryAt = new Date(Date.now() + 300000);
    f.app.findMigrationPullRequest.mockRejectedValueOnce(
      new GitHubDocsError("GITHUB_RATE_LIMITED", 429, retryAt),
    );
    expect(await reconcileGitMigrationPr(f.team.id, f.app)).toMatchObject({
      status: "open",
      diagnostic: "GITHUB_RATE_LIMITED",
      nextAttemptAt: retryAt,
      pullRequestNumber: 2,
      commitSha: f.commit,
      leaseToken: null,
    });
    expect(await reconcileGitMigrationPr(f.team.id, f.app)).toBeNull();
    await db
      .update(requests)
      .set({ nextAttemptAt: new Date(0) })
      .where(eq(requests.planId, f.plan.planId));
    f.app.findMigrationPullRequest.mockResolvedValue({
      number: 2,
      state: "closed",
      merged: true,
      mergeCommitSha: "e".repeat(40),
      headSha: f.commit,
    });
    expect(await reconcileGitMigrationPr(f.team.id, f.app)).toMatchObject({
      status: "merged",
      diagnostic: null,
      mergedCommitSha: "e".repeat(40),
    });
    expect(f.app.createMigrationPullRequest).toHaveBeenCalledTimes(1);
    expect((await getDocsSettings(f.team.id)).source).toBe("editor");
  });
  it("refuses an existing managed docs set and fresh session revocation before writing", async () => {
    const f = await writingFixture();
    f.app.tree.mockResolvedValue([
      { path: "docs/existing.md", type: "blob", mode: "100644", sha: "e".repeat(40) },
    ]);
    await expect(writeGitMigration(f.claimed, f.app, config)).rejects.toMatchObject({
      code: "GITHUB_PROPOSAL_RECOVERY_CONFLICT",
    });
    expect(f.app.createMigrationTree).not.toHaveBeenCalled();
    const other = await writingFixture();
    await db.delete(authSession).where(eq(authSession.id, other.sessionId));
    await expect(
      writeGitMigration(other.claimed, other.app, config),
    ).rejects.toMatchObject({ code: "GITHUB_PUBLISHER_REVOKED" });
    expect(other.app.createMigrationTree).not.toHaveBeenCalled();
  });
  it("persists one immutable request and exposes progress without bodies/credentials or remote writes", async () => {
    const f = await fixture();
    const result = await f.submit();
    expect(result).toMatchObject({ status: "queued", planId: f.plan.planId });
    expect(await f.submit()).toEqual(result);
    expect(
      (await getGitMigration(f.team.id, f.actor, f.plan.planId)).pullRequest,
    ).toEqual(result);
    const rows = await db.query.documentationGitMigrationPrs.findMany({
      where: eq(requests.teamId, f.team.id),
    });
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(f.token);
    expect(JSON.stringify(result)).not.toContain("Private capture");
    expect((await getDocsSettings(f.team.id)).source).toBe("editor");
    expect(f.app.createProposalTree).not.toHaveBeenCalled();
    await expect(
      f.submit({ ...f.input, idempotencyKey: "different" }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
  it("requires the reviewed export disclosure and repository write permissions", async () => {
    const f = await fixture();
    await expect(
      f.submit({ ...f.input, acknowledgeExport: false }),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    f.app.installation.mockResolvedValue({
      permissions: { contents: "read", pull_requests: "write" },
    });
    await expect(f.submit()).rejects.toMatchObject({
      code: "GITHUB_WRITE_PERMISSION_REQUIRED",
    });
    expect(
      await db.query.documentationGitMigrationPrs.findFirst({
        where: eq(requests.planId, f.plan.planId),
      }),
    ).toBeUndefined();
  });
  it("renews failed work with fresh setup proof while preserving remote recovery references", async () => {
    const f = await fixture();
    await f.submit();
    await db
      .update(requests)
      .set({
        status: "failed",
        diagnostic: "GITHUB_SETUP_EXPIRED",
        commitSha: "b".repeat(40),
        pullRequestNumber: 3,
        pullRequestUrl: "https://github.com/org/docs/pull/3",
        finishedAt: new Date(),
      })
      .where(eq(requests.planId, f.plan.planId));
    await db
      .update(setups)
      .set({ expiresAt: new Date(0) })
      .where(eq(setups.setupId, f.setup.setupId));
    await expect(f.submit()).rejects.toMatchObject({ code: "GITHUB_SETUP_EXPIRED" });
    const [renewedSetup] = await db
      .insert(setups)
      .values({
        teamId: f.team.id,
        actorAccountId: f.account.id,
        stateHash: crypto.randomUUID(),
        purpose: "connect",
        returnPath: "/settings/integrations?tab=github",
        status: "authorized",
        encryptedUserToken: "renewed-token",
        githubUserId: "123",
        expiresAt: new Date(Date.now() + 600000),
      })
      .returning();
    const result = await f.submit({ ...f.input, setupId: renewedSetup.setupId });
    expect(result).toMatchObject({
      status: "queued",
      diagnostic: null,
      finishedAt: null,
      commitSha: "b".repeat(40),
      pullRequestNumber: 3,
    });
    expect(
      (await db.query.documentationGitMigrationPrs.findFirst({
        where: eq(requests.planId, f.plan.planId),
      }))!.setupId,
    ).toBe(renewedSetup.setupId);
    await cancelGitMigration(f.team.id, f.actor, f.plan.planId);
    expect(await f.submit({ ...f.input, setupId: renewedSetup.setupId })).toMatchObject(
      { status: "canceled" },
    );
  });
  it("rejects an edited capture and restoration beginning during provider verification", async () => {
    const f = await fixture();
    await saveDocumentation(f.team.id, f.doc.documentId, {
      expectedDraftVersion: 1,
      title: "New local edit",
    });
    await expect(f.submit()).rejects.toMatchObject({ code: "MIGRATION_STALE" });
    const other = await fixture();
    other.app.installation.mockImplementation(async () => {
      process.env.DOCS_RESTORE_PENDING = "true";
      return { permissions: { contents: "write", pull_requests: "write" } };
    });
    await expect(other.submit()).rejects.toMatchObject({ code: "RESTORE_PENDING" });
  });
  it("rechecks session revocation and current manage authority after admission", async () => {
    const f = await fixture();
    await f.submit();
    await db.delete(authSession).where(eq(authSession.id, f.sessionId));
    await expect(f.submit()).rejects.toMatchObject({
      code: "GITHUB_PUBLISHER_REVOKED",
    });
    const other = await fixture();
    const replacement = await seedTeam(db);
    await db
      .update(teams)
      .set({ ownerAccountId: replacement.account.id })
      .where(eq(teams.id, other.team.id));
    await db
      .update(teamMembers)
      .set({ permissions: ["documentation:publish"] })
      .where(eq(teamMembers.accountId, other.account.id));
    await expect(other.submit()).rejects.toMatchObject({
      code: "GITHUB_PUBLISHER_REVOKED",
    });
  });
  it("cancels queued work while preserving the capture and any recorded remote reference", async () => {
    const f = await fixture();
    await f.submit();
    await db
      .update(requests)
      .set({
        pullRequestNumber: 3,
        pullRequestUrl: "https://github.com/org/docs/pull/3",
      })
      .where(eq(requests.planId, f.plan.planId));
    await cancelGitMigration(f.team.id, f.actor, f.plan.planId);
    expect(
      (await getGitMigration(f.team.id, f.actor, f.plan.planId)).pullRequest,
    ).toMatchObject({
      status: "canceled",
      pullRequestNumber: 3,
    });
    expect(
      (await getGitMigration(f.team.id, f.actor, f.plan.planId)).files,
    ).toHaveLength(2);
  });
});
