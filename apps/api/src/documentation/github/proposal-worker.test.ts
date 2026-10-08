import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb, seedTeam, type TestDb } from "../../test/db";
vi.mock("../../db/client", async () => ({ db: await makeTestDb() }));
import { db as appDb } from "../../db/client";
import {
  apiKeys,
  documents,
  documentationSettings as settings,
  documentationGitBindings as bindings,
  documentationGitProposals as proposals,
  documentationGitProposalDocuments as links,
  documentationPublications as publications,
} from "../../db/schema";
import { saveDocumentation } from "../authoring";
import { submitGitProposal } from "./proposals";
import {
  claimGitProposal,
  prepareGitProposal,
  processGitProposalPreparation,
} from "./proposal-worker";
import { gitSourceHash } from "./proposal-patch";
import { GitHubDocsError, type DocsGitHubApp } from "./app";
const db = appDb as unknown as TestDb;
const base = "a".repeat(40),
  head = "b".repeat(40),
  blob = "c".repeat(40),
  untouched = "d".repeat(40);
const original = "---\ntitle: Guide\nslug: guide\n---\n\nOriginal upstream text\n";
async function fixture() {
  const { team, account } = await seedTeam(db);
  const doc = (await saveDocumentation(team.id, null, {
    title: "Guide",
    slug: "guide",
    markdown: "Captured local text",
  }))!;
  await db
    .update(documents)
    .set({
      draftGitSource: {
        sourcePath: "docs/guide.md",
        base: {
          sourcePath: "docs/guide.md",
          commitSha: base,
          sourceHash: gitSourceHash(original),
        },
      },
    })
    .where(eq(documents.documentId, doc.documentId));
  await db.update(settings).set({ source: "git" }).where(eq(settings.teamId, team.id));
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
    capabilities: { read: true, proposals: true, directCommit: false },
  });
  const [key] = await db
    .insert(apiKeys)
    .values({ teamId: team.id, keyHash: crypto.randomUUID(), keyPrefix: "test" })
    .returning();
  const credential = { kind: "apikey" as const, keyId: key.id };
  const input = {
    title: "Review guide",
    selected: [{ documentId: doc.documentId, expectedDraftVersion: 1 }],
    idempotencyKey: crypto.randomUUID(),
  };
  const captured = await submitGitProposal(team.id, credential, input);
  const app = {
    installation: vi.fn().mockResolvedValue({
      id: 7,
      suspended_at: null,
      permissions: { contents: "read" },
    }),
    installationToken: vi
      .fn()
      .mockResolvedValue({ token: "read-token", expires_at: "2030-01-01T00:00:00Z" }),
    repositoryById: vi.fn().mockResolvedValue({
      id: 9,
      owner: { id: 8, login: "org" },
      name: "docs",
      private: true,
    }),
    branchHead: vi.fn().mockResolvedValue(head),
    commitTree: vi.fn().mockResolvedValue([
      { path: "docs", mode: "040000", type: "tree", sha: base },
      { path: "docs/guide.md", mode: "100644", type: "blob", sha: blob },
      { path: "docs/untouched.md", mode: "100644", type: "blob", sha: untouched },
    ]),
    blob: vi.fn(async (_token: string, _owner: string, _name: string, sha: string) =>
      Buffer.from(
        sha === blob
          ? original
          : "---\ntitle: Untouched\nslug: untouched\n---\n\nUntouched guide\n",
      ),
    ),
    createProposalTree: vi.fn(),
    createProposalCommit: vi.fn(),
    createProposalBranch: vi.fn(),
    createProposalPullRequest: vi.fn(),
    advanceBranch: vi.fn(),
  };
  return {
    teamId: team.id,
    doc,
    credential,
    input,
    captured,
    app,
    provider: app as unknown as DocsGitHubApp,
  };
}
function expectNoWrites(app: Awaited<ReturnType<typeof fixture>>["app"]) {
  for (const fn of [
    app.createProposalTree,
    app.createProposalCommit,
    app.createProposalBranch,
    app.createProposalPullRequest,
    app.advanceBranch,
  ])
    expect(fn).not.toHaveBeenCalled();
}
describe("leased Git proposal candidate preparation", () => {
  it("validates the entire current tree at an unrelated newer head while preserving newer local drafts and immutable capture", async () => {
    const f = await fixture();
    f.app.blob.mockImplementation(async (_token, _owner, _name, sha) => {
      if (sha === blob) {
        await saveDocumentation(f.teamId, f.doc.documentId, {
          expectedDraftVersion: 1,
          title: "Later local draft",
          markdown: "Newer private text",
        });
        return Buffer.from(original);
      }
      return Buffer.from(
        "---\ntitle: Untouched\nslug: untouched\n---\n\nUntouched guide\n",
      );
    });
    const result = await processGitProposalPreparation(f.teamId, f.provider);
    expect(result).toMatchObject({
      status: "prepared",
      baseSha: head,
      branch: `frontlit/docs/${f.captured.proposalId}`,
      attempts: 1,
    });
    expect(result!.changes[0].target!.markdown).toContain("Captured local text");
    expect(result!.changes[0].draftVersion).toBe(1);
    expect(
      await db.query.documents.findFirst({
        where: eq(documents.documentId, f.doc.documentId),
      }),
    ).toMatchObject({ draftTitle: "Later local draft", draftVersion: 2 });
    expect(f.app.commitTree).toHaveBeenCalledWith("read-token", "org", "docs", head);
    expect(f.app.blob).toHaveBeenCalledWith("read-token", "org", "docs", untouched);
    expect(
      await db.query.documentationPublications.findMany({
        where: eq(publications.teamId, f.teamId),
      }),
    ).toHaveLength(0);
    expectNoWrites(f.app);
  });
  it("fails selected upstream changes without merging prose and releases the document for a fresh review", async () => {
    const f = await fixture();
    f.app.blob.mockResolvedValue(Buffer.from(original + "Upstream overlapping edit"));
    const result = await processGitProposalPreparation(f.teamId, f.provider);
    expect(result).toMatchObject({
      status: "conflict",
      diagnostics: [expect.objectContaining({ code: "UPSTREAM_CHANGED" })],
    });
    expect(result!.changes[0].target!.markdown).toContain("Captured local text");
    expect(
      await db.query.documentationGitProposalDocuments.findFirst({
        where: eq(links.proposalId, f.captured.proposalId),
      }),
    ).toMatchObject({ open: false });
    expect(
      await submitGitProposal(f.teamId, f.credential, {
        ...f.input,
        idempotencyKey: "review-again",
      }),
    ).toMatchObject({ status: "queued" });
    expectNoWrites(f.app);
  });
  it("rejects invalid unselected content in the full candidate without preparing or publishing it", async () => {
    const f = await fixture();
    f.app.blob.mockImplementation(async (_token, _owner, _name, sha) =>
      Buffer.from(
        sha === blob
          ? original
          : "---\ntitle: Duplicate route\nslug: guide\n---\n\nUnselected content\n",
      ),
    );
    const result = await processGitProposalPreparation(f.teamId, f.provider);
    expect(result!.status).toBe("failed");
    expect(result!.diagnostics.length).toBeGreaterThan(0);
    expect(result!.baseSha).toBeNull();
    expect(
      await db.query.documentationPublications.findMany({
        where: eq(publications.teamId, f.teamId),
      }),
    ).toHaveLength(0);
    expectNoWrites(f.app);
  });
  it("rechecks authority after provider work so a concurrent pause cannot prepare a candidate", async () => {
    const f = await fixture();
    f.app.branchHead.mockImplementation(async () => {
      await db
        .update(bindings)
        .set({ status: "paused" })
        .where(eq(bindings.teamId, f.teamId));
      return head;
    });
    expect(await processGitProposalPreparation(f.teamId, f.provider)).toMatchObject({
      status: "canceled",
      diagnostics: [{ code: "GITHUB_SUPERSEDED" }],
    });
    expectNoWrites(f.app);
  });
  it("retains captured input and open ownership during rate-limit backoff, then prepares the same proposal", async () => {
    const f = await fixture(),
      retryAt = new Date(Date.now() + 120_000);
    f.app.branchHead.mockRejectedValueOnce(
      new GitHubDocsError("GITHUB_RATE_LIMITED", 429, retryAt),
    );
    const result = await processGitProposalPreparation(f.teamId, f.provider);
    expect(result).toMatchObject({
      status: "queued",
      attempts: 0,
      proposalId: f.captured.proposalId,
    });
    expect(result!.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(retryAt.getTime());
    expect(await claimGitProposal(f.teamId)).toBeNull();
    expect(
      await db.query.documentationGitProposalDocuments.findFirst({
        where: eq(links.proposalId, f.captured.proposalId),
      }),
    ).toMatchObject({ open: true });
    await db
      .update(proposals)
      .set({ nextAttemptAt: new Date(0) })
      .where(eq(proposals.proposalId, f.captured.proposalId));
    expect(await processGitProposalPreparation(f.teamId, f.provider)).toMatchObject({
      status: "prepared",
      proposalId: f.captured.proposalId,
    });
    expectNoWrites(f.app);
  });
  it("claims once concurrently, recovers an expired lease and prevents the old worker from continuing", async () => {
    const f = await fixture();
    const results = await Promise.all([
      claimGitProposal(f.teamId),
      claimGitProposal(f.teamId),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const old = results.find(Boolean)!;
    await db
      .update(proposals)
      .set({ leaseExpiresAt: new Date(0) })
      .where(eq(proposals.proposalId, f.captured.proposalId));
    const current = await claimGitProposal(f.teamId);
    expect(current!.leaseToken).not.toBe(old.leaseToken);
    expect(current!.attempts).toBe(2);
    await expect(prepareGitProposal(old, f.provider)).rejects.toMatchObject({
      code: "GITHUB_SUPERSEDED",
    });
    expect(f.app.installation).not.toHaveBeenCalled();
  });
});
