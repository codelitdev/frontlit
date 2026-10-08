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
  documentationGitJobs as jobs,
  documentationGitChecks as checks,
  documentationPublications as publications,
} from "../../db/schema";
import { saveDocumentation } from "../authoring";
import { submitGitProposal } from "./proposals";
import { processGitProposalPreparation } from "./proposal-worker";
import {
  writeGitProposal,
  processGitProposalWrite,
  claimGitProposalWrite,
} from "./proposal-write-worker";
import { processGitProposalQueue } from "./proposal-queue";
import {
  claimGitProposalReview,
  processGitProposalReview,
} from "./proposal-review-worker";
import { gitSourceHash } from "./proposal-patch";
import { GitHubDocsError, type DocsGitHubApp, type GitWriteGuard } from "./app";
const db = appDb as unknown as TestDb;
const base = "a".repeat(40),
  parent = "b".repeat(40),
  blob = "c".repeat(40),
  tree = "d".repeat(40),
  commit = "e".repeat(40),
  advanced = "f".repeat(40);
const original = "---\ntitle: Guide\nslug: guide\n---\n\nOriginal upstream text\n";
async function fixture(
  mode: "pull_request" | "direct" = "pull_request",
  queued = false,
) {
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
    capabilities: { read: true, proposals: true, directCommit: mode === "direct" },
  });
  const [key] = await db
    .insert(apiKeys)
    .values({ teamId: team.id, keyHash: crypto.randomUUID(), keyPrefix: "test" })
    .returning();
  const captured = await submitGitProposal(
    team.id,
    { kind: "apikey", keyId: key.id },
    {
      title: "Review guide",
      mode,
      selected: [{ documentId: doc.documentId, expectedDraftVersion: 1 }],
      idempotencyKey: crypto.randomUUID(),
    },
  );
  const remote = {
    branches: new Map([["trunk", parent]]),
    pr: null as null | {
      number: number;
      url: string;
      state: "open" | "closed";
      merged: boolean;
      mergeCommitSha?: string | null;
    },
    failPr: false,
    failBranch: false,
    failCommit: false,
    failAdvance: false,
    commitParent: parent,
    changeHeadAfterCommit: false,
  };
  const entries = [
    { path: "docs", mode: "040000", type: "tree", sha: base },
    { path: "docs/guide.md", mode: "100644", type: "blob", sha: blob },
    { path: "package.json", mode: "100644", type: "blob", sha: advanced },
  ];
  const app = {
    installation: vi.fn().mockResolvedValue({
      id: 7,
      suspended_at: null,
      permissions: { contents: "write", checks: "write", pull_requests: "write" },
    }),
    installationToken: vi
      .fn()
      .mockResolvedValue({ token: "scoped-token", expires_at: "2030-01-01T00:00:00Z" }),
    repositoryById: vi.fn().mockResolvedValue({
      id: 9,
      owner: { id: 8, login: "org" },
      name: "docs",
      private: true,
    }),
    branchHead: vi.fn(
      async (_token: string, _owner: string, _name: string, branch: string) => {
        const head = remote.branches.get(branch);
        if (!head) throw new GitHubDocsError("GITHUB_REFERENCE_UNAVAILABLE", 404);
        return head;
      },
    ),
    commitTree: vi.fn().mockResolvedValue(entries),
    tree: vi.fn().mockResolvedValue(entries),
    commit: vi.fn(
      async (_token: string, _owner: string, _name: string, sha: string) => ({
        sha,
        tree: { sha: sha === commit ? tree : base },
        parents: [{ sha: sha === commit ? remote.commitParent : base }],
      }),
    ),
    blob: vi.fn().mockResolvedValue(Buffer.from(original)),
    createProposalTree: vi.fn(
      async (
        _token: string,
        _owner: string,
        _name: string,
        _input: unknown,
        guard: GitWriteGuard,
      ) => {
        await guard();
        return tree;
      },
    ),
    createProposalCommit: vi.fn(
      async (
        _token: string,
        _owner: string,
        _name: string,
        input: { parentSha: string },
        guard: GitWriteGuard,
      ) => {
        await guard();
        remote.commitParent = input.parentSha;
        if (remote.changeHeadAfterCommit) remote.branches.set("trunk", "9".repeat(40));
        if (remote.failCommit) {
          remote.failCommit = false;
          throw new GitHubDocsError("GITHUB_UNAVAILABLE");
        }
        return commit;
      },
    ),
    createProposalBranch: vi.fn(
      async (
        _token: string,
        _owner: string,
        _name: string,
        id: string,
        sha: string,
        guard: GitWriteGuard,
      ) => {
        await guard();
        const branch = `frontlit/docs/${id}`;
        remote.branches.set(branch, sha);
        if (remote.failBranch) {
          remote.failBranch = false;
          throw new GitHubDocsError("GITHUB_UNAVAILABLE");
        }
        return branch;
      },
    ),
    findProposalPullRequest: vi.fn(async () => remote.pr),
    createProposalPullRequest: vi.fn(
      async (
        _token: string,
        _owner: string,
        _name: string,
        _input: unknown,
        guard: GitWriteGuard,
      ) => {
        await guard();
        remote.pr = {
          number: 12,
          url: "https://github.com/org/docs/pull/12",
          state: "open",
          merged: false,
        };
        if (remote.failPr) {
          remote.failPr = false;
          throw new GitHubDocsError("GITHUB_UNAVAILABLE");
        }
        return { number: remote.pr.number, url: remote.pr.url };
      },
    ),
    advanceBranch: vi.fn(
      async (
        _token: string,
        _owner: string,
        _name: string,
        input: { branch: string; commitSha: string },
        guard: GitWriteGuard,
      ) => {
        await guard();
        remote.branches.set(input.branch, input.commitSha);
        if (remote.failAdvance) {
          remote.failAdvance = false;
          throw new GitHubDocsError("GITHUB_UNAVAILABLE");
        }
        return input.commitSha;
      },
    ),
    isAncestor: vi.fn(
      async (
        _token: string,
        _owner: string,
        _name: string,
        ancestor: string,
        head: string,
      ) => ancestor === commit && head === advanced,
    ),
  };
  const provider = app as unknown as DocsGitHubApp;
  let prepared;
  if (queued)
    prepared = (await db.query.documentationGitProposals.findFirst({
      where: eq(proposals.proposalId, captured.proposalId),
    }))!;
  else {
    const result = (await processGitProposalPreparation(team.id, provider))!;
    expect(result).toMatchObject({
      status: "prepared",
      leaseToken: null,
      leaseExpiresAt: null,
    });
    prepared = (await claimGitProposalWrite(team.id))!;
  }
  return { teamId: team.id, key, doc, captured, prepared, remote, app, provider };
}
async function release(f: Awaited<ReturnType<typeof fixture>>) {
  await db
    .update(proposals)
    .set({ leaseToken: null, leaseExpiresAt: null, nextAttemptAt: new Date(0) })
    .where(eq(proposals.proposalId, f.captured.proposalId));
}
describe("durable guarded Git proposal writes", () => {
  it("pauses queued proposal work during restoration without provider calls or consuming attempts", async () => {
    const f = await fixture("pull_request", true);
    process.env.DOCS_RESTORE_PENDING = "true";
    try {
      expect(
        await processGitProposalQueue(f.teamId, f.provider, "http://localhost:3000"),
      ).toBeNull();
      expect(
        await processGitProposalWrite(f.teamId, f.provider, "http://localhost:3000"),
      ).toBeNull();
      expect(f.app.branchHead).not.toHaveBeenCalled();
      expect(f.app.createProposalTree).not.toHaveBeenCalled();
      expect(
        await db.query.documentationGitProposals.findFirst({
          where: eq(proposals.proposalId, f.captured.proposalId),
        }),
      ).toMatchObject({ status: "queued", attempts: 0 });
    } finally {
      delete process.env.DOCS_RESTORE_PENDING;
    }
    expect(
      await processGitProposalQueue(f.teamId, f.provider, "http://localhost:3000"),
    ).toMatchObject({ status: "open" });
  });
  it("stops before the next Git mutation when restoration begins during a tree write", async () => {
    const f = await fixture();
    let commitsWritten = 0;
    f.app.createProposalCommit.mockImplementation(async (...args: unknown[]) => {
      await (args.at(-1) as GitWriteGuard)();
      commitsWritten++;
      return commit;
    });
    f.app.createProposalTree.mockImplementationOnce(async (...args: unknown[]) => {
      await (args.at(-1) as GitWriteGuard)();
      process.env.DOCS_RESTORE_PENDING = "true";
      return tree;
    });
    await release(f);
    try {
      expect(
        await processGitProposalWrite(f.teamId, f.provider, "http://localhost:3000"),
      ).toMatchObject({
        status: "writing",
        diagnostics: [{ code: "RESTORE_PENDING" }],
        attempts: f.prepared.attempts,
      });
      expect(commitsWritten).toBe(0);
      expect(f.app.createProposalBranch).not.toHaveBeenCalled();
      expect(f.app.createProposalPullRequest).not.toHaveBeenCalled();
    } finally {
      delete process.env.DOCS_RESTORE_PENDING;
    }
    await release(f);
    expect(
      await processGitProposalWrite(f.teamId, f.provider, "http://localhost:3000"),
    ).toMatchObject({ status: "open" });
  });
  it("dispatches an admitted capture through preparation and writing without waiting for lease expiry", async () => {
    const f = await fixture("pull_request", true);
    expect(
      await processGitProposalQueue(f.teamId, f.provider, "http://localhost:3000"),
    ).toMatchObject({
      proposalId: f.captured.proposalId,
      status: "open",
      leaseToken: null,
    });
    expect(
      await processGitProposalQueue(f.teamId, f.provider, "http://localhost:3000"),
    ).toBeNull();
    expect(f.app.createProposalPullRequest).toHaveBeenCalledTimes(1);
    expect(
      await db.query.documentationGitChecks.findMany({
        where: eq(checks.teamId, f.teamId),
      }),
    ).toMatchObject([{ status: "queued", pullRequestNumber: 12 }]);
    expect(
      await db.query.documentationPublications.findMany({
        where: eq(publications.teamId, f.teamId),
      }),
    ).toHaveLength(0);
  });
  it("creates one selected patch, commit, deterministic branch and PR without changing public docs", async () => {
    const f = await fixture();
    const result = await writeGitProposal(
      f.prepared,
      f.provider,
      "http://localhost:3000",
    );
    expect(result).toMatchObject({
      status: "open",
      baseSha: parent,
      treeSha: tree,
      commitSha: commit,
      pullRequestNumber: 12,
    });
    expect(f.app.createProposalTree.mock.calls[0][3]).toMatchObject({
      baseTreeSha: base,
      edits: [
        {
          path: "docs/guide.md",
          mode: "100644",
          content: expect.stringContaining("Captured local text"),
        },
      ],
    });
    expect(f.app.createProposalCommit.mock.calls[0][3]).toMatchObject({
      parentSha: parent,
      treeSha: tree,
      createdAt: f.prepared.createdAt.toISOString().replace(/\.\d{3}Z$/, "Z"),
    });
    expect(f.app.installationToken).toHaveBeenCalledWith(7, 9, "proposal");
    expect(
      await db.query.documentationPublications.findMany({
        where: eq(publications.teamId, f.teamId),
      }),
    ).toHaveLength(0);
    expect(
      await db.query.documentationGitProposalDocuments.findFirst({
        where: eq(links.proposalId, result.proposalId),
      }),
    ).toMatchObject({
      open: true,
      sourcePath: "docs/guide.md",
      targetPath: "docs/guide.md",
    });
  });
  it("recovers a response-lost PR creation without a duplicate PR, branch, commit or tree", async () => {
    const f = await fixture();
    f.remote.failPr = true;
    await release(f);
    expect(
      await processGitProposalWrite(f.teamId, f.provider, "http://localhost:3000"),
    ).toMatchObject({ status: "writing", treeSha: tree, commitSha: commit });
    await saveDocumentation(f.teamId, f.doc.documentId, {
      expectedDraftVersion: 1,
      title: "Newer draft",
    });
    await release(f);
    expect(
      await processGitProposalWrite(f.teamId, f.provider, "http://localhost:3000"),
    ).toMatchObject({ status: "open", pullRequestNumber: 12 });
    for (const fn of [
      f.app.createProposalTree,
      f.app.createProposalCommit,
      f.app.createProposalBranch,
      f.app.createProposalPullRequest,
    ])
      expect(fn).toHaveBeenCalledTimes(1);
    expect(
      await db.query.documents.findFirst({
        where: eq(documents.documentId, f.doc.documentId),
      }),
    ).toMatchObject({ draftVersion: 2, draftTitle: "Newer draft" });
  });
  it("recovers a response-lost branch and reuses identical metadata for a response-lost commit", async () => {
    for (const stage of ["failBranch", "failCommit"] as const) {
      const f = await fixture();
      f.remote[stage] = true;
      await release(f);
      expect(
        await processGitProposalWrite(f.teamId, f.provider, "http://localhost:3000"),
      ).toMatchObject({ status: "writing" });
      await release(f);
      expect(
        await processGitProposalWrite(f.teamId, f.provider, "http://localhost:3000"),
      ).toMatchObject({ status: "open" });
      expect(f.app.createProposalTree).toHaveBeenCalledTimes(1);
      expect(f.app.createProposalBranch).toHaveBeenCalledTimes(1);
      if (stage === "failCommit")
        expect(f.app.createProposalCommit.mock.calls[0][3]).toEqual(
          f.app.createProposalCommit.mock.calls[1][3],
        );
    }
  });
  it("recovers a closed response-lost PR without reopening it and releases document ownership", async () => {
    const f = await fixture();
    f.remote.failPr = true;
    await release(f);
    await processGitProposalWrite(f.teamId, f.provider, "http://localhost:3000");
    f.remote.pr!.state = "closed";
    await release(f);
    expect(
      await processGitProposalWrite(f.teamId, f.provider, "http://localhost:3000"),
    ).toMatchObject({ status: "closed", pullRequestNumber: 12 });
    expect(f.app.createProposalPullRequest).toHaveBeenCalledTimes(1);
    expect(
      await db.query.documentationGitProposalDocuments.findFirst({
        where: eq(links.proposalId, f.captured.proposalId),
      }),
    ).toMatchObject({ open: false });
  });
  it("recovers a direct commit included in a newer head, queues normal sync and never reports publication success early", async () => {
    const f = await fixture("direct");
    f.remote.failAdvance = true;
    await release(f);
    expect(
      await processGitProposalWrite(f.teamId, f.provider, "http://localhost:3000"),
    ).toMatchObject({ status: "writing" });
    f.remote.branches.set("trunk", advanced);
    await release(f);
    expect(
      await processGitProposalWrite(f.teamId, f.provider, "http://localhost:3000"),
    ).toMatchObject({ status: "merged", commitSha: commit });
    expect(f.app.advanceBranch).toHaveBeenCalledTimes(1);
    expect(f.app.createProposalPullRequest).not.toHaveBeenCalled();
    expect(
      await db.query.documentationGitJobs.findMany({
        where: eq(jobs.teamId, f.teamId),
      }),
    ).toHaveLength(1);
    expect(
      await db.query.documentationPublications.findMany({
        where: eq(publications.teamId, f.teamId),
      }),
    ).toHaveLength(0);
  });
  it("retains drafts after a protected branch rejection and admits a new PR without force or publication (V23)", async () => {
    const f = await fixture("direct");
    f.app.advanceBranch.mockRejectedValueOnce(
      new GitHubDocsError("GITHUB_WRITE_REJECTED", 422),
    );
    await release(f);
    const failed = await processGitProposalWrite(
      f.teamId,
      f.provider,
      "http://localhost:3000",
    );
    expect(failed).toMatchObject({
      status: "conflict",
      diagnostics: [{ code: "GITHUB_WRITE_REJECTED" }],
    });
    expect(f.remote.branches.get("trunk")).toBe(parent);
    expect(f.app.advanceBranch).toHaveBeenCalledTimes(1);
    expect(f.app.createProposalPullRequest).not.toHaveBeenCalled();
    expect(
      await db.query.documentationGitJobs.findMany({
        where: eq(jobs.teamId, f.teamId),
      }),
    ).toHaveLength(0);
    expect(
      await db.query.documentationPublications.findMany({
        where: eq(publications.teamId, f.teamId),
      }),
    ).toHaveLength(0);
    expect(
      await db.query.documents.findFirst({
        where: eq(documents.documentId, f.doc.documentId),
      }),
    ).toMatchObject({ draftVersion: 1, draftContent: f.doc.draftContent });
    expect(
      await db.query.documentationGitProposalDocuments.findFirst({
        where: eq(links.proposalId, f.captured.proposalId),
      }),
    ).toMatchObject({ open: false });
    const replacement = await submitGitProposal(
      f.teamId,
      { kind: "apikey", keyId: f.key.id },
      {
        title: "Review retained draft",
        mode: "pull_request",
        selected: [{ documentId: f.doc.documentId, expectedDraftVersion: 1 }],
        idempotencyKey: "protected-branch-pr",
      },
    );
    expect(replacement).toMatchObject({ status: "queued", mode: "pull_request" });
    expect(f.app.advanceBranch).toHaveBeenCalledTimes(1);
  });
  it("refuses a changed direct branch or a foreign deterministic branch without overwriting either", async () => {
    for (const mode of ["direct", "pull_request"] as const) {
      const f = await fixture(mode);
      if (mode === "direct") f.remote.changeHeadAfterCommit = true;
      else
        f.remote.branches.set(`frontlit/docs/${f.captured.proposalId}`, "9".repeat(40));
      await release(f);
      expect(
        await processGitProposalWrite(f.teamId, f.provider, "http://localhost:3000"),
      ).toMatchObject({ status: "conflict" });
      expect(f.app.advanceBranch).not.toHaveBeenCalled();
      expect(f.app.createProposalBranch).not.toHaveBeenCalled();
      expect(f.app.createProposalPullRequest).not.toHaveBeenCalled();
    }
  });
  it("accepts an unrelated newer head before the first object while keeping the captured file preconditions", async () => {
    const f = await fixture();
    f.remote.branches.set("trunk", advanced);
    await release(f);
    expect(
      await processGitProposalWrite(f.teamId, f.provider, "http://localhost:3000"),
    ).toMatchObject({ status: "open", baseSha: advanced });
    expect(f.app.createProposalCommit.mock.calls[0][3]).toMatchObject({
      parentSha: advanced,
    });
  });
  it("rejects selected-file changes after preparation before creating any remote object", async () => {
    const f = await fixture();
    f.remote.branches.set("trunk", advanced);
    f.app.blob.mockResolvedValue(Buffer.from(original + "Selected upstream edit"));
    await release(f);
    expect(
      await processGitProposalWrite(f.teamId, f.provider, "http://localhost:3000"),
    ).toMatchObject({
      status: "conflict",
      diagnostics: [expect.objectContaining({ code: "UPSTREAM_CHANGED" })],
    });
    expect(f.app.createProposalTree).not.toHaveBeenCalled();
    expect(f.app.createProposalCommit).not.toHaveBeenCalled();
    expect(f.app.createProposalBranch).not.toHaveBeenCalled();
    expect(f.app.createProposalPullRequest).not.toHaveBeenCalled();
  });
  it("stops between tree creation and commit creation if the publisher credential is revoked", async () => {
    const f = await fixture();
    f.app.createProposalTree.mockImplementation(
      async (_token, _owner, _name, _input, guard) => {
        await guard();
        await db.delete(apiKeys).where(eq(apiKeys.id, f.key.id));
        return tree;
      },
    );
    await release(f);
    expect(
      await processGitProposalWrite(f.teamId, f.provider, "http://localhost:3000"),
    ).toMatchObject({ status: "failed" });
    expect(f.app.createProposalCommit).not.toHaveBeenCalled();
    expect(f.app.createProposalBranch).not.toHaveBeenCalled();
    expect(f.app.createProposalPullRequest).not.toHaveBeenCalled();
  });
});

describe("read-only proposal review reconciliation", () => {
  async function openFixture() {
    const f = await fixture();
    await writeGitProposal(f.prepared, f.provider, "http://localhost:3000");
    await release(f);
    f.app.createProposalTree.mockClear();
    f.app.createProposalCommit.mockClear();
    f.app.createProposalBranch.mockClear();
    f.app.createProposalPullRequest.mockClear();
    return f;
  }
  function noWrites(f: Awaited<ReturnType<typeof fixture>>) {
    expect(f.app.createProposalTree).not.toHaveBeenCalled();
    expect(f.app.createProposalCommit).not.toHaveBeenCalled();
    expect(f.app.createProposalBranch).not.toHaveBeenCalled();
    expect(f.app.createProposalPullRequest).not.toHaveBeenCalled();
    expect(f.app.advanceBranch).not.toHaveBeenCalled();
    expect(f.app.installationToken).toHaveBeenLastCalledWith(7, 9, "review");
  }
  it("observes a closed PR after publisher revocation, releases ownership and retains the draft", async () => {
    const f = await openFixture();
    await db.delete(apiKeys).where(eq(apiKeys.id, f.key.id));
    f.remote.pr = { ...f.remote.pr!, state: "closed", merged: false };
    expect(await processGitProposalReview(f.teamId, f.provider)).toMatchObject({
      status: "closed",
      pullRequestNumber: 12,
      leaseToken: null,
    });
    expect(
      await db.query.documentationGitProposalDocuments.findFirst({
        where: eq(links.proposalId, f.captured.proposalId),
      }),
    ).toMatchObject({ open: false });
    expect(
      await db.query.documents.findFirst({
        where: eq(documents.documentId, f.doc.documentId),
      }),
    ).toMatchObject({ draftVersion: 1, draftTitle: "Guide" });
    expect(
      await db.query.documentationGitJobs.findMany({
        where: eq(jobs.teamId, f.teamId),
      }),
    ).toHaveLength(0);
    noWrites(f);
  });
  it("records a merge and queues current branch sync once without claiming publication or overwriting a later draft", async () => {
    const f = await openFixture();
    await saveDocumentation(f.teamId, f.doc.documentId, {
      expectedDraftVersion: 1,
      title: "Later local draft",
    });
    f.remote.pr = {
      ...f.remote.pr!,
      state: "closed",
      merged: true,
      mergeCommitSha: advanced,
    };
    expect(await processGitProposalReview(f.teamId, f.provider)).toMatchObject({
      status: "merged",
      finishedAt: null,
    });
    expect(await processGitProposalReview(f.teamId, f.provider)).toBeNull();
    expect(
      await db.query.documentationGitJobs.findMany({
        where: eq(jobs.teamId, f.teamId),
      }),
    ).toHaveLength(1);
    expect(
      await db.query.documentationPublications.findMany({
        where: eq(publications.teamId, f.teamId),
      }),
    ).toHaveLength(0);
    expect(
      await db.query.documents.findFirst({
        where: eq(documents.documentId, f.doc.documentId),
      }),
    ).toMatchObject({ draftVersion: 2, draftTitle: "Later local draft" });
    expect(
      await db.query.documentationGitProposalDocuments.findFirst({
        where: eq(links.proposalId, f.captured.proposalId),
      }),
    ).toMatchObject({ open: true });
    noWrites(f);
  });
  it("continues read-only review after write capability revocation changes the connection generation", async () => {
    const f = await openFixture();
    await db
      .update(bindings)
      .set({
        generation: 2,
        grantVersion: 2,
        capabilities: { read: true, proposals: false, directCommit: false },
      })
      .where(eq(bindings.teamId, f.teamId));
    f.app.installation.mockResolvedValue({
      id: 7,
      suspended_at: null,
      permissions: { contents: "read", pull_requests: "read" },
    });
    f.remote.pr = { ...f.remote.pr!, state: "closed", merged: false };
    expect(await processGitProposalReview(f.teamId, f.provider)).toMatchObject({
      status: "closed",
    });
    noWrites(f);
  });
  it("does not follow a changed repository identity during read-only review", async () => {
    const f = await openFixture();
    f.app.findProposalPullRequest.mockClear();
    await db
      .update(bindings)
      .set({ generation: 2, repositoryId: "99" })
      .where(eq(bindings.teamId, f.teamId));
    expect(await processGitProposalReview(f.teamId, f.provider)).toMatchObject({
      status: "open",
      diagnostics: [{ code: "GITHUB_SUPERSEDED" }],
    });
    expect(f.app.findProposalPullRequest).not.toHaveBeenCalled();
    expect(f.app.createProposalPullRequest).not.toHaveBeenCalled();
  });
  it("leases review work once and does not poll an unchanged open PR again before its interval", async () => {
    const f = await openFixture();
    expect(await claimGitProposalReview(f.teamId)).toMatchObject({ status: "open" });
    expect(await claimGitProposalReview(f.teamId)).toBeNull();
    await release(f);
    expect(await processGitProposalReview(f.teamId, f.provider)).toMatchObject({
      status: "open",
      leaseToken: null,
    });
    expect(await processGitProposalReview(f.teamId, f.provider)).toBeNull();
    noWrites(f);
  });
  it("does not interpret a missing PR as closed or create a replacement", async () => {
    const f = await openFixture();
    f.remote.pr = null;
    expect(await processGitProposalReview(f.teamId, f.provider)).toMatchObject({
      status: "open",
      pullRequestNumber: 12,
      diagnostics: [{ code: "GITHUB_PROPOSAL_RECOVERY_CONFLICT" }],
    });
    expect(
      await db.query.documentationGitProposalDocuments.findFirst({
        where: eq(links.proposalId, f.captured.proposalId),
      }),
    ).toMatchObject({ open: true });
    noWrites(f);
  });
  it("recovers a response-lost PR after cancellation without restoring writes or draft bodies", async () => {
    const f = await openFixture();
    const finishedAt = new Date();
    await db
      .update(proposals)
      .set({
        status: "canceled",
        pullRequestNumber: null,
        pullRequestUrl: null,
        changes: [],
        finishedAt,
      })
      .where(eq(proposals.proposalId, f.captured.proposalId));
    await db
      .update(links)
      .set({ open: false })
      .where(eq(links.proposalId, f.captured.proposalId));
    await db
      .update(bindings)
      .set({
        generation: 2,
        grantVersion: 2,
        capabilities: { read: true, proposals: false, directCommit: false },
      })
      .where(eq(bindings.teamId, f.teamId));
    await db.delete(apiKeys).where(eq(apiKeys.id, f.key.id));
    f.app.installation.mockResolvedValue({
      id: 7,
      suspended_at: null,
      permissions: { contents: "read", pull_requests: "read" },
    });
    expect(await processGitProposalReview(f.teamId, f.provider)).toMatchObject({
      status: "canceled",
      pullRequestNumber: 12,
      changes: [],
      finishedAt,
    });
    expect(f.app.installationToken).toHaveBeenLastCalledWith(7, 9, "review");
    expect(
      await db.query.documentationGitProposalDocuments.findFirst({
        where: eq(links.proposalId, f.captured.proposalId),
      }),
    ).toMatchObject({ open: false });
    await release(f);
    f.remote.pr = {
      ...f.remote.pr!,
      state: "closed",
      merged: true,
      mergeCommitSha: advanced,
    };
    expect(await processGitProposalReview(f.teamId, f.provider)).toMatchObject({
      status: "canceled",
      mergedCommitSha: advanced,
      changes: [],
    });
    expect(await processGitProposalReview(f.teamId, f.provider)).toBeNull();
    expect(
      await db.query.documentationGitJobs.findMany({
        where: eq(jobs.teamId, f.teamId),
      }),
    ).toHaveLength(1);
    noWrites(f);
  });
  it("observes a canceled branch without creating a missing PR and rejects a changed target", async () => {
    const f = await openFixture();
    await db
      .update(proposals)
      .set({ status: "canceled", pullRequestNumber: null, pullRequestUrl: null })
      .where(eq(proposals.proposalId, f.captured.proposalId));
    f.remote.pr = null;
    expect(await processGitProposalReview(f.teamId, f.provider)).toMatchObject({
      status: "canceled",
      pullRequestNumber: null,
      mergedCommitSha: null,
    });
    await release(f);
    f.remote.branches.set(`frontlit/docs/${f.captured.proposalId}`, advanced);
    expect(await processGitProposalReview(f.teamId, f.provider)).toMatchObject({
      status: "canceled",
      diagnostics: [{ code: "GITHUB_PROPOSAL_RECOVERY_CONFLICT", phase: "review" }],
    });
    await release(f);
    f.app.findProposalPullRequest.mockClear();
    await db
      .update(bindings)
      .set({ repositoryId: "99" })
      .where(eq(bindings.teamId, f.teamId));
    expect(await processGitProposalReview(f.teamId, f.provider)).toMatchObject({
      status: "canceled",
      diagnostics: [{ code: "GITHUB_SUPERSEDED" }],
    });
    expect(f.app.findProposalPullRequest).not.toHaveBeenCalled();
    noWrites(f);
  });
  it("recovers a canceled direct write by ancestry without advancing the branch", async () => {
    const f = await fixture("direct");
    await writeGitProposal(f.prepared!, f.provider, "http://localhost:3000");
    await db
      .update(proposals)
      .set({
        status: "canceled",
        mergedCommitSha: null,
        changes: [],
        nextAttemptAt: new Date(0),
      })
      .where(eq(proposals.proposalId, f.captured.proposalId));
    await db.delete(jobs).where(eq(jobs.teamId, f.teamId));
    f.remote.branches.set("trunk", advanced);
    f.app.isAncestor.mockResolvedValue(true);
    for (const method of [
      f.app.createProposalTree,
      f.app.createProposalCommit,
      f.app.createProposalBranch,
      f.app.createProposalPullRequest,
      f.app.advanceBranch,
    ])
      method.mockClear();
    expect(await processGitProposalReview(f.teamId, f.provider)).toMatchObject({
      status: "canceled",
      mergedCommitSha: commit,
      changes: [],
    });
    expect(f.app.isAncestor).toHaveBeenLastCalledWith(
      "scoped-token",
      "org",
      "docs",
      commit,
      advanced,
    );
    expect(await processGitProposalReview(f.teamId, f.provider)).toBeNull();
    noWrites(f);
  });
  it("preserves concurrent cancellation when a remote read finishes", async () => {
    const f = await openFixture();
    f.app.findProposalPullRequest.mockImplementationOnce(async () => {
      await db
        .update(proposals)
        .set({
          status: "canceled",
          changes: [],
          leaseToken: null,
          leaseExpiresAt: null,
        })
        .where(eq(proposals.proposalId, f.captured.proposalId));
      return {
        ...f.remote.pr!,
        state: "closed",
        merged: true,
        mergeCommitSha: advanced,
      };
    });
    expect(await processGitProposalReview(f.teamId, f.provider)).toMatchObject({
      status: "canceled",
      changes: [],
    });
    expect(
      await db.query.documentationGitJobs.findMany({
        where: eq(jobs.teamId, f.teamId),
      }),
    ).toHaveLength(0);
    noWrites(f);
  });
  it("clears recovered review faults while retaining candidate validation warnings", async () => {
    const f = await openFixture();
    await db
      .update(proposals)
      .set({ diagnostics: [{ code: "TITLE_REPEATED", severity: "warning" }] })
      .where(eq(proposals.proposalId, f.captured.proposalId));
    f.app.findProposalPullRequest.mockRejectedValueOnce(
      new GitHubDocsError("GITHUB_UNAVAILABLE"),
    );
    expect(await processGitProposalReview(f.teamId, f.provider)).toMatchObject({
      diagnostics: [
        { code: "TITLE_REPEATED" },
        { code: "GITHUB_UNAVAILABLE", phase: "review" },
      ],
    });
    await release(f);
    expect(await processGitProposalReview(f.teamId, f.provider)).toMatchObject({
      status: "open",
      diagnostics: [{ code: "TITLE_REPEATED", severity: "warning" }],
    });
    noWrites(f);
  });
  it("honors rate-limit retry without failing or releasing an open proposal", async () => {
    const f = await openFixture();
    const retryAt = new Date(Date.now() + 600_000);
    f.app.findProposalPullRequest.mockRejectedValueOnce(
      new GitHubDocsError("GITHUB_RATE_LIMITED", 429, retryAt),
    );
    const result = await processGitProposalReview(f.teamId, f.provider);
    expect(result).toMatchObject({
      status: "open",
      nextAttemptAt: retryAt,
      leaseToken: null,
      diagnostics: [{ code: "GITHUB_RATE_LIMITED" }],
    });
    expect(await processGitProposalReview(f.teamId, f.provider)).toBeNull();
    noWrites(f);
  });
});
