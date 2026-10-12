import { describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { makeTestDb, seedTeam, type TestDb } from "../../test/db";
vi.mock("../../db/client", async () => ({ db: await makeTestDb() }));
import { db as appDb } from "../../db/client";
import {
  documentationGitBindings as bindings,
  documentationSettings as settings,
  documentationPublications as publications,
} from "../../db/schema";
import { lockSettings } from "../authoring";
import { validateGitPullRequest } from "./pr-validation";
import type { DocsGitHubApp } from "./app";
const db = appDb as unknown as TestDb;
const base = "a".repeat(40),
  head = "b".repeat(40),
  merge = "c".repeat(40),
  tree = "d".repeat(40),
  blob = "e".repeat(40);
async function fixture() {
  const { team, account } = await seedTeam(db);
  await db.transaction(async (tx) => {
    await lockSettings(tx, team.id);
    await tx
      .update(settings)
      .set({ source: "git" })
      .where(eq(settings.teamId, team.id));
  });
  const [binding] = await db
    .insert(bindings)
    .values({
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
    })
    .returning();
  const candidate = {
    number: 12,
    state: "open" as "open" | "closed",
    merged: false,
    headSha: head,
    baseSha: base,
    mergeSha: merge,
    mergeable: true,
    supported: true,
  };
  const app = {
    installation: vi.fn().mockResolvedValue({
      id: 7,
      suspended_at: null,
      permissions: { contents: "read", pull_requests: "read" },
    }),
    installationToken: vi.fn().mockResolvedValue({ token: "read-token" }),
    repositoryById: vi
      .fn()
      .mockResolvedValue({ id: 9, owner: { id: 8, login: "org" }, name: "docs" }),
    pullRequestCandidate: vi.fn().mockResolvedValue(candidate),
    branchHead: vi.fn().mockResolvedValue(base),
    commit: vi.fn().mockResolvedValue({
      sha: merge,
      tree: { sha: tree },
      parents: [{ sha: base }, { sha: head }],
    }),
    tree: vi.fn().mockResolvedValue([
      { path: "docs", type: "tree", mode: "040000", sha: tree },
      { path: "docs/guide.md", type: "blob", mode: "100644", sha: blob },
    ]),
    blob: vi
      .fn()
      .mockResolvedValue(
        Buffer.from("---\ntitle: Guide\nslug: guide\n---\n\nReviewed merged text\n"),
      ),
  };
  return {
    teamId: team.id,
    binding,
    candidate,
    app,
    provider: app as unknown as DocsGitHubApp,
  };
}
describe("immutable PR merge validation", () => {
  it("validates the complete test merge under read-only consent without publishing or preparing embeddings", async () => {
    const f = await fixture(),
      heartbeat = vi.fn(async () => {});
    expect(
      await validateGitPullRequest(f.binding, 12, f.provider, heartbeat),
    ).toMatchObject({
      outcome: "valid",
      headSha: head,
      baseSha: base,
      mergeSha: merge,
      fileCount: 1,
      publishedCount: 1,
    });
    expect(f.app.commit).toHaveBeenCalledWith("read-token", "org", "docs", merge);
    expect(f.app.tree).toHaveBeenCalledWith("read-token", "org", "docs", tree);
    expect(f.app.installationToken).toHaveBeenLastCalledWith(7, 9, "review");
    expect(heartbeat).toHaveBeenCalled();
    expect(
      await db.query.documentationPublications.findMany({
        where: eq(publications.teamId, f.teamId),
      }),
    ).toHaveLength(0);
  });
  it("uses the synthetic merge parents and current branch instead of historical PR base metadata", async () => {
    const f = await fixture();
    f.app.pullRequestCandidate.mockResolvedValue({
      ...f.candidate,
      baseSha: "f".repeat(40),
    });
    expect(await validateGitPullRequest(f.binding, 12, f.provider)).toMatchObject({
      outcome: "valid",
      baseSha: base,
      headSha: head,
      mergeSha: merge,
    });
  });
  it("detects invalid content anywhere in the proposed merge rather than passing the selected head files", async () => {
    const f = await fixture();
    f.app.tree.mockResolvedValue([
      { path: "docs", type: "tree", mode: "040000", sha: tree },
      { path: "docs/guide.mdx", type: "blob", mode: "100644", sha: blob },
    ]);
    expect(await validateGitPullRequest(f.binding, 12, f.provider)).toMatchObject({
      outcome: "invalid",
      diagnostics: [{ code: "UNSUPPORTED_NODE", file: "docs/guide.mdx" }],
    });
    expect(f.app.blob).not.toHaveBeenCalled();
  });
  it("completes a valid candidate with no managed files rather than skipping a required check", async () => {
    const f = await fixture();
    f.app.tree.mockResolvedValue([]);
    expect(await validateGitPullRequest(f.binding, 12, f.provider)).toMatchObject({
      outcome: "valid",
      fileCount: 0,
      publishedCount: 0,
    });
  });
  it.each([
    [{ mergeable: false }, "invalid", "GITHUB_PR_MERGE_CONFLICT"],
    [{ mergeable: null, mergeSha: null }, "incomplete", "GITHUB_PR_MERGE_PENDING"],
    [{ supported: false }, "incomplete", "GITHUB_FORK_UNSUPPORTED"],
  ])(
    "reports unavailable merge %j without fabricating a head-only pass",
    async (override, outcome, code) => {
      const f = await fixture();
      f.app.pullRequestCandidate.mockResolvedValue({ ...f.candidate, ...override });
      expect(await validateGitPullRequest(f.binding, 12, f.provider)).toMatchObject({
        outcome,
        diagnostics: [{ code }],
      });
      expect(f.app.commit).not.toHaveBeenCalled();
    },
  );
  it.each([false, true])(
    "reports a stable closed PR with merged=%s even after the base branch advances",
    async (merged) => {
      const f = await fixture();
      f.app.pullRequestCandidate.mockResolvedValue({
        ...f.candidate,
        state: "closed",
        merged,
      });
      f.app.branchHead.mockResolvedValue("f".repeat(40));
      expect(await validateGitPullRequest(f.binding, 12, f.provider)).toMatchObject({
        outcome: "incomplete",
        diagnostics: [{ code: "GITHUB_PR_CLOSED" }],
      });
      expect(f.app.commit).not.toHaveBeenCalled();
    },
  );
  it("rejects a merge commit with different parents", async () => {
    const f = await fixture();
    f.app.commit.mockResolvedValue({
      sha: merge,
      tree: { sha: tree },
      parents: [{ sha: head }, { sha: base }],
    });
    await expect(
      validateGitPullRequest(f.binding, 12, f.provider),
    ).rejects.toMatchObject({ code: "GITHUB_PR_CHANGED" });
    expect(f.app.tree).not.toHaveBeenCalled();
  });
  it("discards results when either PR head or publishing base changes during validation", async () => {
    const f = await fixture();
    f.app.pullRequestCandidate
      .mockResolvedValueOnce(f.candidate)
      .mockResolvedValueOnce({ ...f.candidate, headSha: "f".repeat(40) });
    await expect(
      validateGitPullRequest(f.binding, 12, f.provider),
    ).rejects.toMatchObject({ code: "GITHUB_PR_CHANGED" });
    f.app.pullRequestCandidate.mockResolvedValue(f.candidate);
    f.app.branchHead.mockResolvedValue("f".repeat(40));
    await expect(
      validateGitPullRequest(f.binding, 12, f.provider),
    ).rejects.toMatchObject({ code: "GITHUB_PR_CHANGED" });
  });
  it("discards results after source pause or local policy changes without mutating publication", async () => {
    const f = await fixture();
    f.app.blob.mockImplementationOnce(async () => {
      await db
        .update(settings)
        .set({ draftVersion: sql`${settings.draftVersion} + 1` })
        .where(eq(settings.teamId, f.teamId));
      return Buffer.from(
        "---\ntitle: Guide\nslug: guide\n---\n\nReviewed merged text\n",
      );
    });
    await expect(
      validateGitPullRequest(f.binding, 12, f.provider),
    ).rejects.toMatchObject({ code: "GITHUB_SUPERSEDED" });
    await db
      .update(bindings)
      .set({ status: "paused" })
      .where(eq(bindings.teamId, f.teamId));
    f.app.pullRequestCandidate.mockClear();
    await expect(
      validateGitPullRequest(f.binding, 12, f.provider),
    ).rejects.toMatchObject({ code: "GITHUB_SUPERSEDED" });
    expect(f.app.pullRequestCandidate).not.toHaveBeenCalled();
  });
});
