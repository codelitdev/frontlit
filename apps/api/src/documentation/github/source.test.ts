import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, type TestDb } from "../../test/db";
vi.mock("../../db/client", async () => ({ db: await makeTestDb() }));
import { db as appDb } from "../../db/client";
import { and, eq } from "drizzle-orm";
import {
  documents,
  documentationGitBindings as bindings,
  documentationGitJobs as jobs,
  documentationGitFiles as files,
  documentationSettings as settings,
  documentationPublications as publications,
  documentationGitSetups as setups,
  teams,
  apiKeys,
  documentationGitProposals as proposals,
  documentationGitProposalDocuments as proposalLinks,
} from "../../db/schema";
import type { AuthzContext } from "../../auth/authorize";
import {
  processPublication,
  readDocumentation,
  rebuildDocumentationRetrieval,
  preflightPurge,
  commitPurge,
} from "../publications";
import { completeGitHubSetup, startGitHubSetup } from "./setup";
import {
  preflightGitHubSource,
  connectGitHubSource,
  changeGitHubSourceState,
  getGitHubSource,
} from "./source";
import { submitGitProposal } from "./proposals";
import { processGitSync } from "./worker";
import { enqueueGitPublicationCheck } from "./publication-checks";
import { getGitCheck } from "./check-reports";
import { saveDocumentation, changeDocumentation } from "../authoring";
import { deriveDocumentStatus } from "../../documents/queries";
import { changeGitHubCapabilities } from "./grants";
import * as gitState from "./state";
import { DocsGitHubApp, GitHubDocsError, type GitHubAppConfig } from "./app";
const db = appDb as unknown as TestDb;
const sha = "a".repeat(40),
  secondSha = "b".repeat(40),
  blob = "c".repeat(40);
const config: GitHubAppConfig = {
  appId: "42",
  appSlug: "test",
  clientId: "client",
  clientSecret: "secret",
  privateKey: "unused",
  callbackUrl: "http://localhost:4000/integrations/github/docs/callback",
  webhookSecret: "secret",
  webOrigin: "http://localhost:3000",
};
const repo = {
  id: 9,
  name: "docs",
  full_name: "org/docs",
  private: true,
  default_branch: "trunk",
  owner: { id: 8, login: "org" },
  permissions: { admin: true },
};
const markdown = (title = "Git Guide") =>
  `---\ntitle: ${title}\nslug: git-guide\ncustom: retained\n---\n\n## Setup\n\nThis guide comes from the configured GitHub commit.\n`;
function provider() {
  return {
    exchangeCode: vi.fn().mockResolvedValue("temporary-user-token"),
    user: vi.fn().mockResolvedValue({ id: 123, login: "admin" }),
    installations: vi.fn().mockResolvedValue({
      installations: [
        {
          id: 7,
          app_id: 42,
          account: { login: "org", type: "Organization" },
          suspended_at: null,
          permissions: { contents: "read" },
        },
      ],
      total_count: 1,
    }),
    repositories: vi.fn().mockResolvedValue({ repositories: [repo], total_count: 1 }),
    repository: vi.fn().mockResolvedValue(repo),
    repositoryById: vi.fn().mockResolvedValue(repo),
    installation: vi.fn().mockResolvedValue({
      id: 7,
      app_id: 42,
      suspended_at: null,
      permissions: { contents: "read" } as Record<string, string>,
    }),
    installationToken: vi.fn().mockResolvedValue({
      token: "repo-read-token",
      expires_at: "2030-01-01T00:00:00Z",
    }),
    branchHead: vi.fn().mockResolvedValue(sha),
    commitTree: vi.fn().mockResolvedValue([
      { path: "docs", mode: "040000", type: "tree", sha },
      { path: "docs/guide.md", mode: "100644", type: "blob", sha: blob },
    ]),
    blob: vi.fn().mockResolvedValue(Buffer.from(markdown())),
    findProposalPullRequest: vi.fn(),
    isAncestor: vi.fn().mockResolvedValue(false),
  };
}
const actualCheck = gitState.checkGitPublicationHead;
describe("reviewed source connection and generation-fenced inbound sync", () => {
  let teamId: string, actor: AuthzContext, app: ReturnType<typeof provider>;
  beforeEach(async () => {
    vi.restoreAllMocks();
    process.env.INTEGRATIONS_ENCRYPTION_KEY = "test-github-source-encryption-key";
    const seed = await seedTeam(db);
    teamId = seed.team.id;
    actor = {
      teamId,
      accountId: seed.account.id,
      authKind: "session",
      isOwner: true,
      permissions: [],
      scopes: [],
      audiences: [],
    };
    app = provider();
    vi.spyOn(gitState, "checkGitPublicationHead").mockImplementation((job) =>
      actualCheck(job, app as unknown as DocsGitHubApp),
    );
  });
  async function preflight() {
    const setup = await startGitHubSetup(teamId, actor, {}, config);
    await completeGitHubSetup(
      new URL(setup.authorizationUrl).searchParams.get("state")!,
      "code",
      config,
      app as unknown as DocsGitHubApp,
    );
    return preflightGitHubSource(
      teamId,
      actor,
      {
        setupId: setup.setupId,
        installationId: 7,
        repositoryId: 9,
        branch: "trunk",
        directory: "docs/",
      },
      config,
      app as unknown as DocsGitHubApp,
    );
  }
  async function connect(report?: any) {
    report ??= await preflight();
    const input = {
      preflightId: report.preflightId,
      commitSha: report.commitSha,
      manifestHash: report.manifestHash,
      expectedDocsDraftVersion: report.docsDraftVersion,
      idempotencyKey: "connect-once",
      consent: {
        publishSelectedDocsPublicly: true as const,
        automaticallyPublishFuturePushes: true as const,
        delegateToWorkspacePublishers: true as const,
      },
    };
    await connectGitHubSource(
      teamId,
      actor,
      input,
      config,
      app as unknown as DocsGitHubApp,
    );
    return input;
  }
  async function publishSync() {
    const sync = await processGitSync(teamId, app as unknown as DocsGitHubApp);
    expect(sync?.status).toBe("preparing");
    const publication = await processPublication(teamId, sync!.publicationId!);
    expect(publication?.status).toBe("active");
    return { sync: sync!, publication: publication! };
  }
  async function upgradeInput(
    consent = { delegatePullRequests: true, delegateDirectCommits: false },
  ) {
    const setup = await startGitHubSetup(teamId, actor, { purpose: "upgrade" }, config);
    await completeGitHubSetup(
      new URL(setup.authorizationUrl).searchParams.get("state")!,
      "code",
      config,
      app as unknown as DocsGitHubApp,
    );
    const binding = (await db.query.documentationGitBindings.findFirst({
      where: eq(bindings.teamId, teamId),
    }))!;
    return {
      setupId: setup.setupId,
      expectedConnectionGeneration: binding.generation,
      expectedGrantVersion: binding.grantVersion,
      idempotencyKey: crypto.randomUUID(),
      consent,
    };
  }
  async function capturedMove(
    laterDraft = false,
    status: "open" | "merged" = "merged",
  ) {
    await connect();
    const original = await publishSync();
    const doc = (await db.query.documents.findFirst({
      where: eq(documents.teamId, teamId),
    }))!;
    await db
      .update(bindings)
      .set({ capabilities: { read: true, proposals: true, directCommit: false } })
      .where(eq(bindings.teamId, teamId));
    const saved = (await saveDocumentation(teamId, doc.documentId, {
      expectedDraftVersion: 1,
      title: "Captured move",
      gitSourcePath: "docs/renamed.md",
    }))!;
    const [key] = await db
      .insert(apiKeys)
      .values({ teamId, keyHash: crypto.randomUUID(), keyPrefix: "test" })
      .returning();
    const captured = await submitGitProposal(
      teamId,
      { kind: "apikey", keyId: key.id },
      {
        title: "Move guide",
        selected: [
          { documentId: doc.documentId, expectedDraftVersion: saved.draftVersion },
        ],
        idempotencyKey: crypto.randomUUID(),
      },
    );
    await db
      .update(proposals)
      .set({
        status,
        commitSha: "d".repeat(40),
        mergedCommitSha: status === "merged" ? secondSha : null,
        branch: `frontlit/docs/${captured.proposalId}`,
        pullRequestNumber: 12,
      })
      .where(eq(proposals.proposalId, captured.proposalId));
    if (laterDraft)
      await saveDocumentation(teamId, doc.documentId, {
        expectedDraftVersion: 2,
        title: "Newer local draft",
      });
    app.branchHead.mockResolvedValue(secondSha);
    app.commitTree.mockResolvedValue([
      { path: "docs", mode: "040000", type: "tree", sha: secondSha },
      { path: "docs/renamed.md", mode: "100644", type: "blob", sha: blob },
    ]);
    app.blob.mockResolvedValue(Buffer.from(markdown("Accepted GitHub review")));
    app.findProposalPullRequest.mockResolvedValue({
      number: 12,
      url: "https://github.com/org/docs/pull/12",
      state: "closed",
      merged: true,
      mergeCommitSha: secondSha,
    });
    await gitState.enqueueGitSync(teamId);
    return { doc, captured, original };
  }
  it("imports a reviewed merged move under its original ID and applies only its captured version after activation", async () => {
    const f = await capturedMove(true);
    const sync = (await processGitSync(teamId, app as unknown as DocsGitHubApp))!;
    expect(sync.status).toBe("preparing");
    expect(
      await db.query.documentationGitProposals.findFirst({
        where: eq(proposals.proposalId, f.captured.proposalId),
      }),
    ).toMatchObject({ status: "merged" });
    expect(
      await db.query.documentationGitProposalDocuments.findFirst({
        where: eq(proposalLinks.proposalId, f.captured.proposalId),
      }),
    ).toMatchObject({ open: true, draftVersion: 2 });
    expect((await readDocumentation(teamId)).publicationId).toBe(
      f.original.publication.publicationId,
    );
    expect(await processPublication(teamId, sync.publicationId!)).toMatchObject({
      status: "active",
    });
    const docs = await db.query.documents.findMany({
      where: eq(documents.teamId, teamId),
    });
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({
      documentId: f.doc.documentId,
      draftVersion: 3,
      draftTitle: "Newer local draft",
      title: "Accepted GitHub review",
    });
    expect(deriveDocumentStatus(docs[0])).toBe("published_with_changes");
    expect(
      await db.query.documentationGitFiles.findFirst({
        where: and(eq(files.teamId, teamId), eq(files.sourcePath, "docs/renamed.md")),
      }),
    ).toMatchObject({ documentId: f.doc.documentId, removedAt: null });
    expect(
      await db.query.documentationGitProposals.findFirst({
        where: eq(proposals.proposalId, f.captured.proposalId),
      }),
    ).toMatchObject({ status: "published" });
    expect(
      await db.query.documentationGitProposalDocuments.findFirst({
        where: eq(proposalLinks.proposalId, f.captured.proposalId),
      }),
    ).toMatchObject({ open: false, draftVersion: 2 });
  });
  it("discovers a merged open PR during sync before review polling and refreshes an unchanged captured draft", async () => {
    const f = await capturedMove(false, "open");
    await publishSync();
    expect(
      await db.query.documents.findFirst({
        where: eq(documents.documentId, f.doc.documentId),
      }),
    ).toMatchObject({
      documentId: f.doc.documentId,
      draftTitle: "Accepted GitHub review",
      draftVersion: 3,
      draftGitSource: {
        sourcePath: "docs/renamed.md",
        base: { sourcePath: "docs/renamed.md", commitSha: secondSha },
      },
    });
    expect(
      await db.query.documentationGitProposals.findFirst({
        where: eq(proposals.proposalId, f.captured.proposalId),
      }),
    ).toMatchObject({ status: "published", mergedCommitSha: secondSha });
    expect(app.findProposalPullRequest).toHaveBeenCalledTimes(1);
    expect(app.installationToken).toHaveBeenCalledWith(7, 9, "review");
  });
  it("recovers a legacy merged PR's missing merged SHA from current provider metadata", async () => {
    const f = await capturedMove();
    await db
      .update(proposals)
      .set({ mergedCommitSha: null })
      .where(eq(proposals.proposalId, f.captured.proposalId));
    await publishSync();
    expect(
      await db.query.documentationGitProposals.findFirst({
        where: eq(proposals.proposalId, f.captured.proposalId),
      }),
    ).toMatchObject({ status: "published", mergedCommitSha: secondSha });
    expect(app.findProposalPullRequest).toHaveBeenCalledTimes(1);
  });
  it("rejects a reintroduced historical path alongside the current path instead of giving one document two identities", async () => {
    const f = await capturedMove();
    await publishSync();
    app.branchHead.mockResolvedValue("e".repeat(40));
    app.commitTree.mockResolvedValue([
      { path: "docs", mode: "040000", type: "tree", sha: secondSha },
      { path: "docs/guide.md", mode: "100644", type: "blob", sha: "d".repeat(40) },
      { path: "docs/renamed.md", mode: "100644", type: "blob", sha: blob },
    ]);
    app.blob.mockImplementation(
      async (_token: string, _owner: string, _name: string, id: string) =>
        Buffer.from(
          id === blob
            ? markdown("Accepted GitHub review")
            : markdown("Historical copy").replace(
                "slug: git-guide",
                "slug: historical",
              ),
        ),
    );
    await gitState.enqueueGitSync(teamId);
    expect(await processGitSync(teamId, app as unknown as DocsGitHubApp)).toMatchObject(
      { status: "failed", diagnostic: "GITHUB_PROPOSAL_IDENTITY_CONFLICT" },
    );
    expect(
      await db.query.documents.findMany({ where: eq(documents.teamId, teamId) }),
    ).toMatchObject([
      { documentId: f.doc.documentId, title: "Accepted GitHub review" },
    ]);
  });
  it("does not apply a merge not included in the current publishing head", async () => {
    const f = await capturedMove();
    app.branchHead.mockResolvedValue(sha);
    app.isAncestor.mockResolvedValue(false);
    const sync = await processGitSync(teamId, app as unknown as DocsGitHubApp);
    expect(sync).toMatchObject({
      status: "active",
      publicationId: f.original.publication.publicationId,
    });
    expect(
      await db.query.documentationGitProposals.findFirst({
        where: eq(proposals.proposalId, f.captured.proposalId),
      }),
    ).toMatchObject({ status: "merged" });
    expect(app.isAncestor).toHaveBeenCalledWith(
      "repo-read-token",
      "org",
      "docs",
      secondSha,
      sha,
    );
  });
  it("leaves proposal ownership and the last publication intact when merged content is invalid", async () => {
    const f = await capturedMove();
    app.blob.mockResolvedValue(
      Buffer.from(markdown().replace("slug: git-guide", "slug: collections/rejected")),
    );
    expect(await processGitSync(teamId, app as unknown as DocsGitHubApp)).toMatchObject(
      { status: "failed" },
    );
    expect((await readDocumentation(teamId)).publicationId).toBe(
      f.original.publication.publicationId,
    );
    expect(
      await db.query.documentationGitProposals.findFirst({
        where: eq(proposals.proposalId, f.captured.proposalId),
      }),
    ).toMatchObject({ status: "merged" });
    expect(
      await db.query.documentationGitProposalDocuments.findFirst({
        where: eq(proposalLinks.proposalId, f.captured.proposalId),
      }),
    ).toMatchObject({ open: true });
  });
  async function captureAdditionOrRemoval(remove: boolean) {
    await connect();
    await publishSync();
    const original = (await db.query.documents.findFirst({
      where: eq(documents.teamId, teamId),
    }))!;
    await db
      .update(bindings)
      .set({ capabilities: { read: true, proposals: true, directCommit: false } })
      .where(eq(bindings.teamId, teamId));
    const doc = remove
      ? original
      : (await saveDocumentation(teamId, null, {
          title: "New draft",
          gitSourcePath: "docs/added.md",
        }))!;
    const [key] = await db
      .insert(apiKeys)
      .values({ teamId, keyHash: crypto.randomUUID(), keyPrefix: "test" })
      .returning();
    const selection = {
      documentId: doc.documentId,
      expectedDraftVersion: doc.draftVersion,
    };
    const proposal = await submitGitProposal(
      teamId,
      { kind: "apikey", keyId: key.id },
      {
        title: remove ? "Remove guide" : "Add guide",
        selected: remove ? [] : [selection],
        removals: remove ? [selection] : [],
        idempotencyKey: crypto.randomUUID(),
      },
    );
    await db
      .update(proposals)
      .set({ status: "merged", mergedCommitSha: secondSha })
      .where(eq(proposals.proposalId, proposal.proposalId));
    app.branchHead.mockResolvedValue(secondSha);
    app.commitTree.mockResolvedValue(
      remove
        ? []
        : [
            { path: "docs", mode: "040000", type: "tree", sha: secondSha },
            { path: "docs/guide.md", mode: "100644", type: "blob", sha: blob },
            {
              path: "docs/added.md",
              mode: "100644",
              type: "blob",
              sha: "d".repeat(40),
            },
          ],
    );
    app.blob.mockImplementation(
      async (_token: string, _owner: string, _name: string, id: string) =>
        Buffer.from(
          id === blob
            ? markdown()
            : markdown("Accepted new guide").replace("slug: git-guide", "slug: added"),
        ),
    );
    await gitState.enqueueGitSync(teamId);
    await publishSync();
    return { original, doc, proposal };
  }
  it("retains a newly submitted draft ID when its new Git file is first imported", async () => {
    const f = await captureAdditionOrRemoval(false);
    const docs = await db.query.documents.findMany({
      where: eq(documents.teamId, teamId),
    });
    expect(docs).toHaveLength(2);
    expect(docs.find((d) => d.documentId === f.doc.documentId)).toMatchObject({
      title: "Accepted new guide",
      draftTitle: "Accepted new guide",
      draftGitSource: { sourcePath: "docs/added.md", base: { commitSha: secondSha } },
    });
    expect(
      await db.query.documentationGitProposals.findFirst({
        where: eq(proposals.proposalId, f.proposal.proposalId),
      }),
    ).toMatchObject({ status: "published" });
  });
  it("applies a captured file removal only when the empty branch candidate activates, retaining its recoverable draft", async () => {
    const f = await captureAdditionOrRemoval(true);
    expect((await readDocumentation(teamId)).items).toHaveLength(0);
    expect(
      await db.query.documents.findFirst({
        where: eq(documents.documentId, f.doc.documentId),
      }),
    ).toMatchObject({ publishedAt: null, draftTitle: "Git Guide", draftVersion: 1 });
    expect(
      await db.query.documentationGitProposals.findFirst({
        where: eq(proposals.proposalId, f.proposal.proposalId),
      }),
    ).toMatchObject({ status: "published" });
    expect(
      await db.query.documentationGitProposalDocuments.findFirst({
        where: eq(proposalLinks.proposalId, f.proposal.proposalId),
      }),
    ).toMatchObject({ open: false, draftVersion: 1, targetPath: null });
  });
  it("uses purged minimal move references to prevent a merged target from recreating a purged identity", async () => {
    const f = await capturedMove();
    const plan = await preflightPurge(teamId, [f.doc.documentId], actor.accountId!);
    await commitPurge(
      teamId,
      {
        planId: plan.purgeId,
        planHash: plan.planHash,
        acknowledgment: "irreversible-deletion",
        idempotencyKey: "purge-move",
      },
      {
        accountId: actor.accountId!,
        authKind: "session",
        isOwner: true,
        sessionAuthenticatedAt: new Date(),
      },
    );
    await gitState.enqueueGitSync(teamId);
    expect(await processGitSync(teamId, app as unknown as DocsGitHubApp)).toMatchObject(
      { status: "failed", diagnostic: "PURGED_IDENTITY" },
    );
    expect(
      await db.query.documents.findMany({ where: eq(documents.teamId, teamId) }),
    ).toHaveLength(0);
    expect(
      await db.query.documentationGitProposals.findFirst({
        where: eq(proposals.proposalId, f.captured.proposalId),
      }),
    ).toMatchObject({ status: "canceled", changes: [], mergedCommitSha: secondSha });
    expect(
      await db.query.documentationGitProposalDocuments.findFirst({
        where: eq(proposalLinks.proposalId, f.captured.proposalId),
      }),
    ).toMatchObject({
      documentId: f.doc.documentId,
      sourcePath: "docs/guide.md",
      targetPath: "docs/renamed.md",
      open: false,
    });
  });
  const approveWrites = () => ({
    id: 7,
    app_id: 42,
    suspended_at: null,
    permissions: { contents: "write", pull_requests: "write", checks: "write" },
  });
  it("keeps upgraded installation rights read-only until original-account interactive workspace consent, and records PR-only delegation", async () => {
    await connect();
    app.installation.mockResolvedValue(approveWrites());
    const input = await upgradeInput();
    expect((await getGitHubSource(teamId)).binding?.capabilities).toEqual({
      read: true,
      proposals: false,
      directCommit: false,
    });
    await expect(
      changeGitHubCapabilities(
        teamId,
        { ...actor, authKind: "oauth" },
        input,
        config,
        app as unknown as DocsGitHubApp,
      ),
    ).rejects.toMatchObject({ code: "GITHUB_USER_AUTH_REQUIRED" });
    const result = await changeGitHubCapabilities(
      teamId,
      actor,
      input,
      config,
      app as unknown as DocsGitHubApp,
    );
    expect(result).toMatchObject({
      grantVersion: 2,
      connectionGeneration: 2,
      capabilities: { read: true, proposals: true, directCommit: false },
    });
    expect(
      await db.query.documentationGitSetups.findFirst({
        where: eq(setups.setupId, input.setupId),
      }),
    ).toMatchObject({
      status: "consumed",
      encryptedUserToken: null,
      encryptedVerifier: null,
    });
    expect(
      await changeGitHubCapabilities(
        teamId,
        actor,
        input,
        config,
        app as unknown as DocsGitHubApp,
      ),
    ).toEqual(result);
    const denied = await upgradeInput({
      delegatePullRequests: false,
      delegateDirectCommits: false,
    });
    await changeGitHubCapabilities(
      teamId,
      actor,
      denied,
      config,
      app as unknown as DocsGitHubApp,
    );
    expect((await getGitHubSource(teamId)).binding?.capabilities.proposals).toBe(false);
    await changeGitHubCapabilities(
      teamId,
      actor,
      input,
      config,
      app as unknown as DocsGitHubApp,
    );
    expect((await getGitHubSource(teamId)).binding?.capabilities.proposals).toBe(false);
    await expect(
      changeGitHubCapabilities(
        teamId,
        actor,
        {
          ...input,
          consent: { delegatePullRequests: true, delegateDirectCommits: true },
        },
        config,
        app as unknown as DocsGitHubApp,
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
  it("rejects stale reviews, missing App permissions and wrong-account approval without enabling writes", async () => {
    await connect();
    const input = await upgradeInput();
    await expect(
      changeGitHubCapabilities(
        teamId,
        actor,
        input,
        config,
        app as unknown as DocsGitHubApp,
      ),
    ).rejects.toMatchObject({ code: "GITHUB_WRITE_PERMISSION_REQUIRED" });
    app.installation.mockResolvedValue(approveWrites());
    await expect(
      changeGitHubCapabilities(
        teamId,
        { ...actor, accountId: "other" },
        input,
        config,
        app as unknown as DocsGitHubApp,
      ),
    ).rejects.toMatchObject({ code: "GITHUB_USER_AUTH_REQUIRED" });
    const competing = await upgradeInput({
      delegatePullRequests: true,
      delegateDirectCommits: true,
    });
    await changeGitHubCapabilities(
      teamId,
      actor,
      competing,
      config,
      app as unknown as DocsGitHubApp,
    );
    await expect(
      changeGitHubCapabilities(
        teamId,
        actor,
        input,
        config,
        app as unknown as DocsGitHubApp,
      ),
    ).rejects.toMatchObject({ code: "GITHUB_GRANT_STALE" });
  });
  it("keeps paused intent during a reviewed direct-commit upgrade and admits no sync until resume", async () => {
    await connect();
    await changeGitHubSourceState(teamId, actor, "pause");
    app.installation.mockResolvedValue(approveWrites());
    const input = await upgradeInput({
      delegatePullRequests: false,
      delegateDirectCommits: true,
    });
    const queuedBefore = await db.query.documentationGitJobs.findMany({
      where: eq(jobs.teamId, teamId),
    });
    await changeGitHubCapabilities(
      teamId,
      actor,
      input,
      config,
      app as unknown as DocsGitHubApp,
    );
    expect(await getGitHubSource(teamId)).toMatchObject({
      status: "paused",
      binding: { capabilities: { proposals: false, directCommit: true } },
    });
    expect(
      await db.query.documentationGitJobs.findMany({ where: eq(jobs.teamId, teamId) }),
    ).toHaveLength(queuedBefore.length);
  });
  it("rechecks the binding after administrator verification and cannot override a concurrent pause", async () => {
    await connect();
    const input = await upgradeInput();
    let reads = 0;
    app.installation.mockImplementation(async () => {
      if (++reads === 2) await changeGitHubSourceState(teamId, actor, "pause");
      return approveWrites();
    });
    await expect(
      changeGitHubCapabilities(
        teamId,
        actor,
        input,
        config,
        app as unknown as DocsGitHubApp,
      ),
    ).rejects.toMatchObject({ code: "GITHUB_GRANT_STALE" });
    expect(await getGitHubSource(teamId)).toMatchObject({
      status: "paused",
      binding: { capabilities: { proposals: false, directCommit: false } },
    });
    await expect(
      changeGitHubCapabilities(
        teamId,
        { ...actor, isOwner: false, permissions: [] },
        input,
        config,
        app as unknown as DocsGitHubApp,
      ),
    ).rejects.toMatchObject({ code: "GITHUB_USER_AUTH_REQUIRED" });
  });
  it("rejects a manager whose permissions disappear while external administrator access is being verified", async () => {
    await connect();
    const input = await upgradeInput();
    const other = await seedTeam(db);
    let reads = 0;
    app.installation.mockImplementation(async () => {
      if (++reads === 2)
        await db
          .update(teams)
          .set({ ownerAccountId: other.account.id })
          .where(eq(teams.id, teamId));
      return approveWrites();
    });
    await expect(
      changeGitHubCapabilities(
        teamId,
        actor,
        input,
        config,
        app as unknown as DocsGitHubApp,
      ),
    ).rejects.toMatchObject({ code: "GITHUB_USER_AUTH_REQUIRED" });
    const binding = (await db.query.documentationGitBindings.findFirst({
      where: eq(bindings.teamId, teamId),
    }))!;
    expect(binding.capabilities).toEqual({
      read: true,
      proposals: false,
      directCommit: false,
    });
    expect(binding.grantVersion).toBe(1);
  });
  it.each([true, false])(
    "discards Git edits to the latest accepted import, with published=%s, without publishing",
    async (published) => {
      app.blob.mockResolvedValue(
        Buffer.from(markdown().replace("custom:", `published: ${published}\ncustom:`)),
      );
      await connect();
      await publishSync();
      const imported = (await db.query.documents.findFirst({
        where: eq(documents.teamId, teamId),
      }))!;
      const saved = (await saveDocumentation(teamId, imported.documentId, {
        expectedDraftVersion: imported.draftVersion,
        title: "Local title",
        gitSourcePath: "docs/moved.md",
      }))!;
      app.branchHead.mockResolvedValue(secondSha);
      app.blob.mockResolvedValue(
        Buffer.from(
          markdown("New accepted title").replace(
            "custom:",
            `published: ${published}\ncustom:`,
          ),
        ),
      );
      await gitState.enqueueGitSync(teamId);
      await publishSync();
      const before = await readDocumentation(teamId);
      const accepted = (await db.query.documentationGitFiles.findFirst({
        where: eq(files.teamId, teamId),
      }))!;
      const restored = (await changeDocumentation(
        teamId,
        imported.documentId,
        saved.draftVersion,
        "discard",
      ))!;
      expect(restored).toMatchObject({
        source: "git",
        saved: true,
        draftTitle: "New accepted title",
        draftVersion: saved.draftVersion + 1,
        draftHash: accepted.snapshot.draftHash,
        draftMeta: accepted.snapshot.draftMeta,
        draftMarkdown: accepted.markdown,
        draftGitSource: {
          sourcePath: "docs/guide.md",
          base: { commitSha: secondSha, sourceHash: accepted.sourceHash },
        },
      });
      expect(await readDocumentation(teamId)).toEqual(before);
      await expect(
        changeDocumentation(teamId, imported.documentId, saved.draftVersion, "discard"),
      ).rejects.toThrow();
    },
  );
  it("retains a Git draft when its imported file has been removed", async () => {
    await connect();
    await publishSync();
    const imported = (await db.query.documents.findFirst({
      where: eq(documents.teamId, teamId),
    }))!;
    await db
      .update(files)
      .set({ removedAt: new Date() })
      .where(eq(files.teamId, teamId));
    const before = await readDocumentation(teamId);
    expect(
      await changeDocumentation(
        teamId,
        imported.documentId,
        imported.draftVersion,
        "discard",
      ),
    ).toMatchObject({
      source: "git",
      saved: false,
      draftVersion: imported.draftVersion,
      diagnostics: [{ code: "NO_PUBLISHED_REVISION" }],
    });
    expect(await readDocumentation(teamId)).toEqual(before);
  });
  it("saves versioned Git proposals with a server-derived immutable base, preserving local work through upstream import", async () => {
    await connect();
    await publishSync();
    const imported = (await db.query.documents.findFirst({
      where: eq(documents.teamId, teamId),
    }))!;
    const saved = (await saveDocumentation(teamId, imported.documentId, {
      expectedDraftVersion: 1,
      title: "Local proposal",
    }))!;
    expect(saved.draftGitSource).toMatchObject({
      sourcePath: "docs/guide.md",
      base: { commitSha: sha, sourcePath: "docs/guide.md" },
    });
    const originalBase = saved.draftGitSource;
    app.branchHead.mockResolvedValue(secondSha);
    app.blob.mockResolvedValue(Buffer.from(markdown("Upstream change")));
    await gitState.enqueueGitSync(teamId);
    await publishSync();
    const retained = (await db.query.documents.findFirst({
      where: eq(documents.documentId, imported.documentId),
    }))!;
    expect(retained).toMatchObject({
      draftVersion: 2,
      draftTitle: "Local proposal",
      title: "Upstream change",
      draftGitSource: originalBase,
    });
    const later = (await saveDocumentation(teamId, imported.documentId, {
      expectedDraftVersion: 2,
      title: "Later local proposal",
    }))!;
    expect(later.draftGitSource).toEqual(originalBase);
    await expect(
      changeDocumentation(teamId, imported.documentId, 3, "publish"),
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "SOURCE_REQUIRES_GIT" })],
    });
    await expect(
      saveDocumentation(teamId, imported.documentId, {
        expectedDraftVersion: 3,
        draftGitSource: { base: null },
      }),
    ).rejects.toThrow();
  });
  it("requires a safe source path for a new Git draft and never changes live membership on save", async () => {
    await connect();
    const first = await publishSync();
    await expect(
      saveDocumentation(teamId, null, { title: "New" }),
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "GIT_SOURCE_PATH_REQUIRED" })],
    });
    for (const path of [
      "outside.md",
      "docs/../outside.md",
      "docs/.github/workflows/run.md",
      "docs/image.png",
    ]) {
      await expect(
        saveDocumentation(teamId, null, { title: "Unsafe", gitSourcePath: path }),
      ).rejects.toThrow();
    }
    const saved = (await saveDocumentation(teamId, null, {
      title: "New local",
      gitSourcePath: "docs/guides/new.md",
    }))!;
    expect(saved.draftGitSource).toEqual({
      sourcePath: "docs/guides/new.md",
      base: null,
    });
    expect(saved.publishedAt).toBeNull();
    expect((await readDocumentation(teamId)).publicationId).toBe(
      first.publication.publicationId,
    );
    expect((await readDocumentation(teamId)).items).toHaveLength(1);
  });
  it("preserves a path-only draft move through upstream import and reports unpublished changes", async () => {
    await connect();
    await publishSync();
    const original = (await db.query.documents.findFirst({
      where: eq(documents.teamId, teamId),
    }))!;
    const moved = (await saveDocumentation(teamId, original.documentId, {
      expectedDraftVersion: 1,
      gitSourcePath: "docs/renamed.md",
    }))!;
    expect(moved.draftHash).toBe(original.draftHash);
    expect(deriveDocumentStatus(moved)).toBe("published_with_changes");
    app.branchHead.mockResolvedValue(secondSha);
    app.blob.mockResolvedValue(Buffer.from(markdown("Upstream update")));
    await gitState.enqueueGitSync(teamId);
    await publishSync();
    expect(
      await db.query.documents.findFirst({
        where: eq(documents.documentId, original.documentId),
      }),
    ).toMatchObject({ draftVersion: 2, draftGitSource: moved.draftGitSource });
  });
  it("admits only the remaining manual sync capacity and rejects without superseding admitted work; pause remains available", async () => {
    await connect();
    await db.insert(jobs).values(
      Array.from({ length: 19 }, (_, i) => ({
        teamId,
        connectionGeneration: 0,
        requestGeneration: i + 1,
        trigger: "manual" as const,
        status: "active" as const,
      })),
    );
    const results = await Promise.allSettled([
      gitState.enqueueGitSync(teamId, { trigger: "manual" }),
      gitState.enqueueGitSync(teamId, { trigger: "manual" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const accepted = (
      results.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<any>
    ).value;
    expect(
      await db.query.documentationGitJobs.findFirst({
        where: eq(jobs.runId, accepted.runId),
      }),
    ).toMatchObject({ status: "queued", trigger: "manual" });
    await expect(
      gitState.enqueueGitSync(teamId, { trigger: "manual" }),
    ).rejects.toMatchObject({ retryAfter: expect.any(Number) });
    expect(
      await db.query.documentationGitJobs.findFirst({
        where: eq(jobs.runId, accepted.runId),
      }),
    ).toMatchObject({ status: "queued" });
    await expect(
      changeGitHubSourceState(teamId, actor, "pause"),
    ).resolves.toMatchObject({ status: "paused" });
  });
  it("reconciles an unchanged live commit without importing or creating another publication", async () => {
    await connect();
    const initial = await publishSync();
    const before = await db.query.documentationSettings.findFirst({
      where: eq(settings.teamId, teamId),
    });
    app.commitTree.mockClear();
    app.blob.mockClear();
    await gitState.enqueueGitSync(teamId);
    const sync = await processGitSync(teamId, app as unknown as DocsGitHubApp);
    expect(sync).toMatchObject({
      status: "active",
      publicationId: initial.publication.publicationId,
      observedSha: sha,
      leaseToken: null,
    });
    expect(app.commitTree).not.toHaveBeenCalled();
    expect(app.blob).not.toHaveBeenCalled();
    const after = await db.query.documentationSettings.findFirst({
      where: eq(settings.teamId, teamId),
    });
    expect(after).toEqual(before);
    expect(
      await db.query.documentationPublications.findMany({
        where: eq(publications.teamId, teamId),
      }),
    ).toHaveLength(1);
  });
  it.each([false, true])(
    "clears a transient sync error after recovery (changed commit: %s)",
    async (changed) => {
      await connect();
      const initial = await publishSync();
      if (changed) {
        app.branchHead.mockResolvedValue(secondSha);
        app.blob.mockResolvedValue(Buffer.from(markdown("Recovered guide")));
      }
      await gitState.enqueueGitSync(teamId);
      app.branchHead.mockRejectedValueOnce(
        new GitHubDocsError("GITHUB_UNAVAILABLE", 503),
      );
      const failed = await processGitSync(teamId, app as unknown as DocsGitHubApp);
      expect(failed).toMatchObject({
        status: "queued",
        diagnostic: "GITHUB_UNAVAILABLE",
      });
      expect((await getGitHubSource(teamId)).sync?.diagnostic).toBe(
        "GITHUB_UNAVAILABLE",
      );
      await db
        .update(jobs)
        .set({ nextAttemptAt: new Date(0) })
        .where(eq(jobs.runId, failed!.runId));
      const recovered = await processGitSync(teamId, app as unknown as DocsGitHubApp);
      expect(recovered).toMatchObject({
        status: changed ? "preparing" : "active",
        diagnostic: null,
        diagnosticReport: null,
      });
      if (changed) await processPublication(teamId, recovered!.publicationId!);
      const source = await getGitHubSource(teamId);
      expect(source.sync).toMatchObject({
        status: "active",
        diagnostic: null,
        diagnostics: [],
      });
      expect(source.binding).toMatchObject({
        lastDiagnostic: null,
        liveSha: changed ? secondSha : sha,
      });
      expect((await readDocumentation(teamId)).items[0].title).toBe(
        changed ? "Recovered guide" : "Git Guide",
      );
      if (!changed)
        expect(source.sync?.publicationId).toBe(initial.publication.publicationId);
    },
  );
  it("retrieval changes reconcile Git data and preserve an unsubmitted local draft", async () => {
    await connect();
    await publishSync();
    const document = (await db.query.documents.findFirst({
      where: eq(documents.teamId, teamId),
    }))!;
    await db
      .update(documents)
      .set({
        draftTitle: "Private local proposal",
        draftHash: "local-draft-hash",
        draftVersion: document.draftVersion + 1,
      })
      .where(eq(documents.documentId, document.documentId));
    await db
      .update(settings)
      .set({ indexing: { enabled: false, mode: "lexical" } })
      .where(eq(settings.teamId, teamId));
    const rebuild = await rebuildDocumentationRetrieval(teamId);
    expect(rebuild).toMatchObject({ status: "queued" });
    const sync = await processGitSync(teamId, app as unknown as DocsGitHubApp);
    expect(sync).toMatchObject({ status: "preparing" });
    await processPublication(teamId, sync!.publicationId!);
    const live = await readDocumentation(teamId);
    expect(live.items[0].title).toBe("Git Guide");
    expect(
      await db.query.documents.findFirst({
        where: eq(documents.documentId, document.documentId),
      }),
    ).toMatchObject({
      draftTitle: "Private local proposal",
      draftHash: "local-draft-hash",
    });
    expect(
      await db.query.documentationPublications.findFirst({
        where: eq(publications.publicationId, sync!.publicationId!),
      }),
    ).toMatchObject({ source: "git", indexing: { enabled: false, mode: "lexical" } });
  });
  it("preflight is private, connection records consent and queues exactly the reviewed commit, and retries are idempotent", async () => {
    const report: any = await preflight();
    expect(report).toMatchObject({
      publishable: true,
      fileCount: 1,
      publishedCount: 1,
      commitSha: sha,
      repositoryPrivate: true,
      publishedDefaultsToTrue: true,
      selectedDocsWillBePublic: true,
    });
    expect(
      await db.query.documents.findMany({ where: eq(documents.teamId, teamId) }),
    ).toEqual([]);
    const input = await connect(report);
    expect((await getGitHubSource(teamId)).status).toBe("connected");
    expect((await readDocumentation(teamId)).items).toHaveLength(0);
    const binding = (await db.query.documentationGitBindings.findFirst({
      where: eq(bindings.teamId, teamId),
    }))!;
    expect(binding).toMatchObject({
      grantActorAccountId: actor.accountId,
      grantGithubUserId: "123",
      repositoryAdminVerified: true,
      capabilities: { read: true, proposals: false, directCommit: false },
      branch: "trunk",
      directory: "docs",
    });
    await connectGitHubSource(
      teamId,
      actor,
      input,
      config,
      app as unknown as DocsGitHubApp,
    );
    expect(
      await db.query.documentationGitJobs.findMany({ where: eq(jobs.teamId, teamId) }),
    ).toHaveLength(1);
    await expect(
      connectGitHubSource(
        teamId,
        actor,
        { ...input, commitSha: secondSha },
        config,
        app as unknown as DocsGitHubApp,
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    const { publication } = await publishSync();
    expect(publication.gitContext).toMatchObject({
      commitSha: sha,
      repositoryId: "9",
      ownerId: "8",
      connectionGeneration: 1,
    });
    expect((await readDocumentation(teamId)).items[0].title).toBe("Git Guide");
    expect((await getGitHubSource(teamId)).binding?.liveSha).toBe(sha);
    const stored = (
      await db.query.documentationGitFiles.findMany({ where: eq(files.teamId, teamId) })
    )[0];
    expect(stored.markdown).toBe(markdown());
    expect(stored.frontmatter.custom).toBe("retained");
  });
  it("rechecks docs version and nonempty CMS state so connecting cannot replace content created after preflight", async () => {
    const report: any = await preflight();
    await db.insert(documents).values({
      teamId,
      kind: "doc",
      slug: "existing",
      draftTitle: "Existing",
      draftContent: { type: "doc", content: [] },
    });
    await expect(connect(report)).rejects.toMatchObject({
      code: "SOURCE_MIGRATION_REQUIRED",
    });
    expect((await getGitHubSource(teamId)).source).toBe("editor");
    await db
      .insert(settings)
      .values({ teamId, draftVersion: report.docsDraftVersion + 1 })
      .onConflictDoUpdate({
        target: settings.teamId,
        set: { draftVersion: report.docsDraftVersion + 1 },
      });
    await expect(connect(report)).rejects.toMatchObject({ code: "STALE_DOCS_DRAFT" });
  });
  it("leaves imports queued without provider calls while backup restoration is pending", async () => {
    await connect();
    app.branchHead.mockClear();
    app.commitTree.mockClear();
    process.env.DOCS_RESTORE_PENDING = "true";
    try {
      expect(await processGitSync(teamId, app as unknown as DocsGitHubApp)).toBeNull();
      expect(app.branchHead).not.toHaveBeenCalled();
      expect(app.commitTree).not.toHaveBeenCalled();
      expect(
        await db.query.documentationGitJobs.findFirst({
          where: eq(jobs.teamId, teamId),
        }),
      ).toMatchObject({ status: "queued", attempts: 0 });
      expect(
        await db.query.documents.findMany({ where: eq(documents.teamId, teamId) }),
      ).toHaveLength(0);
    } finally {
      delete process.env.DOCS_RESTORE_PENDING;
    }
    await publishSync();
  });
  it("requeues an import paused during provider work without capturing restored content or burning a retry", async () => {
    await connect();
    const first = await publishSync();
    app.branchHead.mockResolvedValue(secondSha);
    app.blob.mockImplementationOnce(async () => {
      process.env.DOCS_RESTORE_PENDING = "true";
      return Buffer.from(markdown("Restored secret candidate"));
    });
    await gitState.enqueueGitSync(teamId);
    let paused;
    try {
      paused = await processGitSync(teamId, app as unknown as DocsGitHubApp);
      expect(paused).toMatchObject({
        status: "queued",
        diagnostic: "RESTORE_PENDING",
        attempts: 0,
        publicationId: null,
      });
      expect(
        (
          await db.query.documentationSettings.findFirst({
            where: eq(settings.teamId, teamId),
          })
        )?.activePublicationId,
      ).toBe(first.publication.publicationId);
    } finally {
      delete process.env.DOCS_RESTORE_PENDING;
    }
    await db
      .update(jobs)
      .set({ nextAttemptAt: new Date(0) })
      .where(eq(jobs.runId, paused!.runId));
    await publishSync();
  });
  it("syncs and serves all 501 documents without truncating the publication (V27)", async () => {
    await connect();
    await publishSync();
    app.branchHead.mockResolvedValue(secondSha);
    const bodies = new Map<string, Buffer>();
    const entries: { path: string; mode: string; type: string; sha: string }[] = [
      { path: "docs", mode: "040000", type: "tree", sha: secondSha },
    ];
    for (let i = 0; i < 501; i++) {
      const name = `guide-${i.toString().padStart(4, "0")}`;
      const id = (i + 1).toString(16).padStart(40, "0");
      entries.push({ path: `docs/${name}.md`, mode: "100644", type: "blob", sha: id });
      bodies.set(
        id,
        Buffer.from(
          `---\ntitle: ${name}\nindexable: false\n---\n\nA complete imported page.\n`,
        ),
      );
    }
    app.commitTree.mockResolvedValue(entries);
    app.blob.mockImplementation(
      async (...args: unknown[]) => bodies.get(args[3] as string)!,
    );
    await gitState.enqueueGitSync(teamId);
    const result = await publishSync();
    const live = await readDocumentation(teamId);
    expect(live.publicationId).toBe(result.publication.publicationId);
    expect(live.items).toHaveLength(501);
    expect(new Set(live.items.map((item: any) => item.documentId)).size).toBe(501);
    expect(live.items.some((item: any) => item.slug === "guide-0500")).toBe(true);
    expect((await getGitHubSource(teamId)).binding?.liveSha).toBe(secondSha);
  }, 60000);
  it("does not retain diagnostic prose produced across a policy change", async () => {
    await connect();
    await publishSync();
    app.branchHead.mockResolvedValue(secondSha);
    app.blob.mockImplementationOnce(async () => {
      await db
        .update(settings)
        .set({ policyEpoch: 1 })
        .where(eq(settings.teamId, teamId));
      return Buffer.from("---\ntitle: Broken\n---\n\n<script>private text</script>");
    });
    await gitState.enqueueGitSync(teamId);
    const failed = await processGitSync(teamId, app as unknown as DocsGitHubApp);
    expect(failed).toMatchObject({ status: "failed", diagnosticReport: null });
    expect((await getGitHubSource(teamId)).sync?.diagnostics).toEqual([]);
    const check = await enqueueGitPublicationCheck(teamId, failed!.runId);
    expect(check.publicationResult?.diagnostics).toEqual([
      expect.objectContaining({
        message: failed!.diagnostic,
        code: failed!.diagnostic,
      }),
    ]);
  });
  it("retains both conflicting files before publication creation and erases the report on purge", async () => {
    await connect();
    const first = await publishSync();
    app.branchHead.mockResolvedValue(secondSha);
    app.commitTree.mockResolvedValue([
      { path: "docs", mode: "040000", type: "tree", sha },
      { path: "docs/guide.md", mode: "100644", type: "blob", sha: blob },
      { path: "docs/conflict.md", mode: "100644", type: "blob", sha: "d".repeat(40) },
    ]);
    await gitState.enqueueGitSync(teamId);
    const failed = await processGitSync(teamId, app as unknown as DocsGitHubApp);
    expect(failed).toMatchObject({
      status: "failed",
      observedSha: secondSha,
      publicationId: null,
    });
    const diagnostics = failed!.diagnosticReport!.diagnostics;
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "DUPLICATE_ROUTE",
        file: "docs/guide.md",
        relatedFiles: ["docs/conflict.md"],
      }),
    );
    expect((await getGitHubSource(teamId)).sync?.diagnostics).toEqual(diagnostics);
    expect((await readDocumentation(teamId)).publicationId).toBe(
      first.publication.publicationId,
    );
    const check = await enqueueGitPublicationCheck(teamId, failed!.runId);
    expect((await getGitCheck(teamId, check.checkId)).publicationResult).toMatchObject({
      outcome: "failed",
      commitSha: secondSha,
      diagnostics,
    });
    await db
      .update(settings)
      .set({ policyEpoch: 1 })
      .where(eq(settings.teamId, teamId));
    expect((await getGitHubSource(teamId)).sync?.diagnostics).toEqual([]);
    expect(
      (await getGitCheck(teamId, check.checkId)).publicationResult?.diagnostics,
    ).toEqual([]);
    const document = (await db.query.documents.findFirst({
      where: eq(documents.teamId, teamId),
    }))!;
    const plan = await preflightPurge(teamId, [document.documentId], actor.accountId!);
    await commitPurge(
      teamId,
      {
        planId: plan.purgeId,
        planHash: plan.planHash,
        acknowledgment: "irreversible-deletion",
        idempotencyKey: "purge-failed-report",
      },
      {
        accountId: actor.accountId!,
        isOwner: true,
        authKind: "session",
        sessionAuthenticatedAt: new Date(),
      },
    );
    expect(
      (
        await db.query.documentationGitJobs.findFirst({
          where: eq(jobs.runId, failed!.runId),
        })
      )?.diagnosticReport,
    ).toBeNull();
  });
  it("keeps the last successful publication and newer local drafts intact on failed and successful upstream imports", async () => {
    await connect();
    const first = await publishSync();
    app.branchHead.mockResolvedValue(secondSha);
    app.blob.mockResolvedValue(
      Buffer.from("---\ntitle: Broken\n---\n\n<script>bad()</script>"),
    );
    await gitState.enqueueGitSync(teamId);
    expect(await processGitSync(teamId, app as unknown as DocsGitHubApp)).toMatchObject(
      {
        status: "failed",
        observedSha: secondSha,
        publicationId: null,
      },
    );
    expect((await readDocumentation(teamId)).publicationId).toBe(
      first.publication.publicationId,
    );
    const doc = (await db.query.documents.findFirst({
      where: and(eq(documents.teamId, teamId), eq(documents.kind, "doc")),
    }))!;
    await db
      .update(documents)
      .set({
        draftTitle: "New local proposal",
        draftVersion: 2,
        draftHash: "local-proposal",
      })
      .where(eq(documents.documentId, doc.documentId));
    app.blob.mockResolvedValue(Buffer.from(markdown("Upstream reviewed guide")));
    await gitState.enqueueGitSync(teamId);
    await publishSync();
    expect(
      await db.query.documents.findFirst({
        where: eq(documents.documentId, doc.documentId),
      }),
    ).toMatchObject({
      draftTitle: "New local proposal",
      draftVersion: 2,
      draftHash: "local-proposal",
      title: "Upstream reviewed guide",
    });
  });
  it("pause/disconnect invalidate in-flight candidates while retaining Git ownership and last live content; resume reconciles", async () => {
    await connect();
    const first = await publishSync();
    app.branchHead.mockResolvedValue(secondSha);
    app.blob.mockResolvedValue(Buffer.from(markdown("Next guide")));
    await gitState.enqueueGitSync(teamId);
    const candidate = await processGitSync(teamId, app as unknown as DocsGitHubApp);
    await changeGitHubSourceState(teamId, actor, "pause");
    expect(await processPublication(teamId, candidate!.publicationId!)).toBeNull();
    expect((await readDocumentation(teamId)).publicationId).toBe(
      first.publication.publicationId,
    );
    expect(await getGitHubSource(teamId)).toMatchObject({
      source: "git",
      status: "paused",
    });
    await changeGitHubSourceState(
      teamId,
      actor,
      "resume",
      config,
      app as unknown as DocsGitHubApp,
    );
    await publishSync();
    await changeGitHubSourceState(teamId, actor, "disconnect");
    expect(await getGitHubSource(teamId)).toMatchObject({
      source: "git",
      status: "disconnected",
    });
    expect((await readDocumentation(teamId)).items[0].title).toBe("Next guide");
  });
  it("a newer branch head supersedes a prepared candidate and queues reconciliation, without publication", async () => {
    await connect();
    const candidate = await processGitSync(teamId, app as unknown as DocsGitHubApp);
    app.branchHead.mockResolvedValue(secondSha);
    const outcome = await processPublication(teamId, candidate!.publicationId!);
    // enqueueGitSync cleared the old worker lease when superseding its generation.
    expect(
      outcome?.status ??
        (
          await db.query.documentationPublications.findFirst({
            where: eq(publications.publicationId, candidate!.publicationId!),
          })
        )?.status,
    ).toBe("superseded");
    expect((await readDocumentation(teamId)).items).toHaveLength(0);
    expect(
      await db.query.documentationGitJobs.findFirst({
        where: and(eq(jobs.teamId, teamId), eq(jobs.status, "queued")),
      }),
    ).toBeTruthy();
  });
  it("a complete deleted source directory removes live membership, but a missing branch never becomes empty content", async () => {
    await connect();
    const first = await publishSync();
    app.branchHead.mockRejectedValue(
      new GitHubDocsError("GITHUB_REFERENCE_UNAVAILABLE", 404),
    );
    await gitState.enqueueGitSync(teamId);
    expect(
      (await processGitSync(teamId, app as unknown as DocsGitHubApp))?.status,
    ).toBe("failed");
    expect((await readDocumentation(teamId)).publicationId).toBe(
      first.publication.publicationId,
    );
    app.branchHead.mockResolvedValue(secondSha);
    app.commitTree.mockResolvedValue([]);
    await gitState.enqueueGitSync(teamId);
    await publishSync();
    expect((await readDocumentation(teamId)).items).toHaveLength(0);
  });
});
