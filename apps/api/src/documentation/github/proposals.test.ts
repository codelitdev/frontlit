import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { parseDocsMarkdown } from "@frontlit/text-editor/docs";
import { makeTestDb, seedTeam, type TestDb } from "../../test/db";
vi.mock("../../db/client", async () => ({ db: await makeTestDb() }));
import { db as appDb } from "../../db/client";
import {
  apiKeys,
  documents,
  documentationSettings as settings,
  documentationGitBindings as bindings,
  documentationGitProposals as proposals,
  documentationGitChecks as checks,
  documentationGitProposalDocuments as links,
} from "../../db/schema";
import { saveDocumentation } from "../authoring";
import { submitGitProposal, getGitProposal, listGitProposals } from "./proposals";
import { assertGitProposalWriteAuthority } from "./proposal-authority";
import type { GitPublisherCredential } from "./publisher";
import { preflightPurge, commitPurge } from "../publications";
const db = appDb as unknown as TestDb;
async function fixture() {
  const { team, account } = await seedTeam(db);
  const doc = (await saveDocumentation(team.id, null, {
    title: "Captured guide",
    markdown: "Original private draft",
    meta: { frontmatter: { custom: "retained" } },
  }))!;
  const base = {
    commitSha: "a".repeat(40),
    sourcePath: "docs/guide.md",
    sourceHash: "b".repeat(64),
  };
  await db
    .update(documents)
    .set({ draftGitSource: { sourcePath: base.sourcePath, base } })
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
  const credential: GitPublisherCredential = { kind: "apikey", keyId: key.id };
  const input = {
    title: "Review captured guide",
    selected: [{ documentId: doc.documentId, expectedDraftVersion: 1 }],
    idempotencyKey: crypto.randomUUID(),
  };
  return { teamId: team.id, accountId: account.id, doc, input, credential };
}
describe("durable exact-version Git proposal admission", () => {
  it("paginates tied timestamps without duplicates and rejects foreign or absent cursors identically", async () => {
    const f = await fixture();
    const submitted = await submitGitProposal(f.teamId, f.credential, f.input);
    const row = (await db.query.documentationGitProposals.findFirst({
      where: eq(proposals.proposalId, submitted.proposalId),
    }))!;
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    await db
      .update(proposals)
      .set({ createdAt })
      .where(eq(proposals.proposalId, row.proposalId));
    const ids = [row.proposalId, "gproposal_historya", "gproposal_historyb"];
    for (const proposalId of ids.slice(1)) {
      await db.insert(proposals).values({
        ...row,
        proposalId,
        idempotencyKey: proposalId,
        status: "closed",
        createdAt,
      });
      await db.insert(links).values({
        teamId: f.teamId,
        proposalId,
        documentId: f.doc.documentId,
        draftVersion: 1,
        sourcePath: "docs/guide.md",
        targetPath: "docs/guide.md",
        open: false,
      });
    }
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await listGitProposals(f.teamId, {
        limit: 1,
        ...(cursor ? { cursor } : {}),
      });
      seen.push(...page.items.map((item) => item.proposalId));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(seen).toEqual(ids.sort().reverse());
    expect(await listGitProposals((await fixture()).teamId)).toEqual({
      items: [],
      nextCursor: null,
    });
    const foreign = await fixture();
    const foreignProposal = await submitGitProposal(
      foreign.teamId,
      foreign.credential,
      foreign.input,
    );
    for (const cursor of [foreignProposal.proposalId, "gproposal_absent"])
      await expect(listGitProposals(f.teamId, { cursor })).rejects.toMatchObject({
        code: "INVALID_CURSOR",
        status: 400,
      });
    for (const input of [{ limit: 51 }, { limit: 0 }, { extra: true }])
      await expect(listGitProposals(f.teamId, input)).rejects.toMatchObject({
        code: "INVALID_REQUEST",
        status: 400,
      });
    expect(JSON.stringify(await listGitProposals(f.teamId))).not.toMatch(
      /Original private draft|actorCredential|keyId/,
    );
  });
  it("allows only the current validated writing lease, preserving later local draft edits", async () => {
    const f = await fixture(),
      result = await submitGitProposal(f.teamId, f.credential, f.input);
    const identity = {
      teamId: f.teamId,
      proposalId: result.proposalId,
      leaseToken: "worker-lease",
    };
    await expect(assertGitProposalWriteAuthority(identity)).rejects.toMatchObject({
      code: "GITHUB_SUPERSEDED",
    });
    await db
      .update(proposals)
      .set({
        status: "writing",
        leaseToken: identity.leaseToken,
        leaseExpiresAt: new Date(Date.now() + 60_000),
      })
      .where(eq(proposals.proposalId, result.proposalId));
    await saveDocumentation(f.teamId, f.doc.documentId, {
      expectedDraftVersion: 1,
      title: "Later draft",
    });
    await expect(assertGitProposalWriteAuthority(identity)).resolves.toBeUndefined();
    await expect(
      assertGitProposalWriteAuthority({ ...identity, leaseToken: "old-worker" }),
    ).rejects.toMatchObject({ code: "GITHUB_SUPERSEDED" });
    await db
      .update(proposals)
      .set({ leaseExpiresAt: new Date(0) })
      .where(eq(proposals.proposalId, result.proposalId));
    await expect(assertGitProposalWriteAuthority(identity)).rejects.toMatchObject({
      code: "GITHUB_SUPERSEDED",
    });
  });
  it("checks grant generations, pause, capability removal and credential revocation anew for each write", async () => {
    const f = await fixture(),
      result = await submitGitProposal(f.teamId, f.credential, f.input);
    const identity = {
      teamId: f.teamId,
      proposalId: result.proposalId,
      leaseToken: "worker-lease",
    };
    await db
      .update(proposals)
      .set({
        status: "writing",
        leaseToken: identity.leaseToken,
        leaseExpiresAt: new Date(Date.now() + 60_000),
      })
      .where(eq(proposals.proposalId, result.proposalId));
    const binding = (await db.query.documentationGitBindings.findFirst({
      where: eq(bindings.teamId, f.teamId),
    }))!;
    for (const patch of [
      { status: "paused" as const },
      { generation: binding.generation + 1 },
      { grantVersion: binding.grantVersion + 1 },
    ]) {
      await db.update(bindings).set(patch).where(eq(bindings.teamId, f.teamId));
      await expect(assertGitProposalWriteAuthority(identity)).rejects.toMatchObject({
        code: "GITHUB_SUPERSEDED",
      });
      await db
        .update(bindings)
        .set({
          status: binding.status,
          generation: binding.generation,
          grantVersion: binding.grantVersion,
        })
        .where(eq(bindings.teamId, f.teamId));
    }
    await db
      .update(bindings)
      .set({ capabilities: { ...binding.capabilities, proposals: false } })
      .where(eq(bindings.teamId, f.teamId));
    await expect(assertGitProposalWriteAuthority(identity)).rejects.toMatchObject({
      code: "GITHUB_WRITE_PERMISSION_REQUIRED",
    });
    await db
      .update(bindings)
      .set({ capabilities: binding.capabilities })
      .where(eq(bindings.teamId, f.teamId));
    await db
      .delete(apiKeys)
      .where(eq(apiKeys.id, (f.credential as { keyId: string }).keyId));
    await expect(assertGitProposalWriteAuthority(identity)).rejects.toThrow();
  });
  it("captures Markdown, provenance and exact versions without exposing bodies or credentials; later saves do not mutate the capture", async () => {
    const f = await fixture();
    const result = await submitGitProposal(f.teamId, f.credential, f.input);
    expect(result).toMatchObject({
      status: "queued",
      captured: [
        { documentId: f.doc.documentId, draftVersion: 1, sourcePath: "docs/guide.md" },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(
      /Original private draft|actorCredential|keyId/,
    );
    const stored = (await db.query.documentationGitProposals.findFirst({
      where: eq(proposals.proposalId, result.proposalId),
    }))!;
    expect(
      parseDocsMarkdown(stored.changes[0].target!.markdown).frontmatter,
    ).toMatchObject({ title: "Captured guide", custom: "retained", published: true });
    await saveDocumentation(f.teamId, f.doc.documentId, {
      expectedDraftVersion: 1,
      title: "Later draft",
      gitSourcePath: "docs/moved.md",
    });
    const after = (await db.query.documentationGitProposals.findFirst({
      where: eq(proposals.proposalId, result.proposalId),
    }))!;
    expect(after.changes).toEqual(stored.changes);
    expect(await submitGitProposal(f.teamId, f.credential, f.input)).toEqual(result);
    await expect(
      submitGitProposal(f.teamId, f.credential, {
        ...f.input,
        title: "Different title",
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
  it("serializes concurrent admissions and permits one open proposal per document", async () => {
    const f = await fixture();
    const results = await Promise.allSettled([
      submitGitProposal(f.teamId, f.credential, f.input),
      submitGitProposal(f.teamId, f.credential, {
        ...f.input,
        idempotencyKey: "second",
      }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason,
    ).toMatchObject({ code: "PROPOSAL_ALREADY_OPEN" });
    expect(
      await db.query.documentationGitProposalDocuments.findMany({
        where: eq(links.teamId, f.teamId),
      }),
    ).toHaveLength(1);
  });
  it("rejects stale captures, unsupported direct mode and paused sources without partial records", async () => {
    const f = await fixture();
    await expect(
      submitGitProposal(f.teamId, f.credential, { ...f.input, mode: "direct" }),
    ).rejects.toMatchObject({ code: "GITHUB_WRITE_PERMISSION_REQUIRED" });
    await saveDocumentation(f.teamId, f.doc.documentId, {
      expectedDraftVersion: 1,
      title: "Changed",
    });
    await expect(
      submitGitProposal(f.teamId, f.credential, f.input),
    ).rejects.toMatchObject({ currentDraftVersion: 2 });
    await db
      .update(bindings)
      .set({ status: "paused" })
      .where(eq(bindings.teamId, f.teamId));
    await expect(
      submitGitProposal(f.teamId, f.credential, {
        ...f.input,
        selected: [{ documentId: f.doc.documentId, expectedDraftVersion: 2 }],
      }),
    ).rejects.toMatchObject({ code: "SOURCE_REQUIRES_GIT" });
    expect(
      await db.query.documentationGitProposals.findMany({
        where: eq(proposals.teamId, f.teamId),
      }),
    ).toHaveLength(0);
  });
  it("captures removals with versions and preserves explicit unpublished selected files", async () => {
    const f = await fixture();
    const removed = await submitGitProposal(f.teamId, f.credential, {
      title: "Remove",
      selected: [],
      removals: f.input.selected,
      idempotencyKey: "removal",
    });
    expect(
      (await db.query.documentationGitProposals.findFirst({
        where: eq(proposals.proposalId, removed.proposalId),
      }))!.changes[0].target,
    ).toBeNull();
    const other = await fixture();
    const kept = await submitGitProposal(other.teamId, other.credential, {
      ...other.input,
      selected: [{ ...other.input.selected[0], published: false }],
    });
    const body = (await db.query.documentationGitProposals.findFirst({
      where: eq(proposals.proposalId, kept.proposalId),
    }))!.changes[0].target!.markdown;
    expect(parseDocsMarkdown(body).frontmatter!.published).toBe(false);
  });
  it("counts proposals in the shared admission quota and replays existing captures without counting another request", async () => {
    const f = await fixture();
    for (let i = 0; i < 20; i++) {
      const result = await submitGitProposal(f.teamId, f.credential, {
        ...f.input,
        idempotencyKey: `quota-${i}`,
      });
      await db
        .update(proposals)
        .set({ status: "closed", finishedAt: new Date() })
        .where(eq(proposals.proposalId, result.proposalId));
      await db
        .update(links)
        .set({ open: false })
        .where(eq(links.proposalId, result.proposalId));
    }
    expect(
      await submitGitProposal(f.teamId, f.credential, {
        ...f.input,
        idempotencyKey: "quota-0",
      }),
    ).toMatchObject({ status: "closed" });
    await expect(
      submitGitProposal(f.teamId, f.credential, {
        ...f.input,
        idempotencyKey: "overflow",
      }),
    ).rejects.toMatchObject({ retryAfter: expect.any(Number) });
    expect(
      await db.query.documentationGitProposals.findMany({
        where: eq(proposals.teamId, f.teamId),
      }),
    ).toHaveLength(20);
  });
  it("sensitive purge cancels local proposal work and erases copied bodies, diagnostics and title while retaining credential/remote audit references", async () => {
    const f = await fixture();
    const captured = await submitGitProposal(f.teamId, f.credential, f.input);
    const identity = {
      teamId: f.teamId,
      proposalId: captured.proposalId,
      leaseToken: "purged-worker",
    };
    await db
      .update(proposals)
      .set({
        status: "writing",
        leaseToken: identity.leaseToken,
        leaseExpiresAt: new Date(Date.now() + 60_000),
      })
      .where(eq(proposals.proposalId, captured.proposalId));
    await assertGitProposalWriteAuthority(identity);
    const [check] = await db
      .insert(checks)
      .values({
        teamId: f.teamId,
        connectionGeneration: 1,
        pullRequestNumber: 12,
        status: "reporting",
        leaseToken: "check-worker",
        leaseExpiresAt: new Date(Date.now() + 60_000),
        result: {
          docsDraftVersion: 1,
          policyEpoch: 1,
          purgeGeneration: 1,
          number: 12,
          headSha: "a".repeat(40),
          baseSha: "b".repeat(40),
          mergeSha: "c".repeat(40),
          outcome: "invalid",
          fileCount: 1,
          publishedCount: 1,
          diagnostics: [
            {
              code: "PRIVATE_DIAGNOSTIC",
              message: "Private retained prose",
              file: "docs/private.md",
              severity: "error",
              blocksSave: false,
              blocksPublish: true,
            },
          ],
        },
      })
      .returning();
    const [publicationCheck] = await db
      .insert(checks)
      .values({
        teamId: f.teamId,
        connectionGeneration: 1,
        syncRunId: "gsync_purge_report",
        status: "reporting",
        leaseToken: "publication-worker",
        leaseExpiresAt: new Date(Date.now() + 60_000),
        publicationResult: {
          commitSha: "a".repeat(40),
          publicationId: null,
          outcome: "failed",
          publishedCount: 0,
          policyEpoch: 1,
          purgeGeneration: 1,
          diagnostics: [
            {
              code: "INVALID_DOCUMENT",
              message: "Private publication prose",
              severity: "error",
              blocksSave: false,
              blocksPublish: true,
            },
          ],
        },
      })
      .returning();
    const purge = await preflightPurge(f.teamId, [f.doc.documentId], f.accountId);
    await commitPurge(
      f.teamId,
      {
        planId: purge.purgeId,
        planHash: purge.planHash,
        acknowledgment: "irreversible-deletion",
        idempotencyKey: "erase",
      },
      {
        accountId: f.accountId,
        authKind: "session",
        isOwner: true,
        sessionAuthenticatedAt: new Date(),
      },
    );
    expect(
      await db.query.documentationGitProposals.findFirst({
        where: eq(proposals.proposalId, captured.proposalId),
      }),
    ).toMatchObject({
      status: "canceled",
      changes: [],
      diagnostics: [],
      title: "Purged documentation proposal",
    });
    expect(
      await db.query.documentationGitProposalDocuments.findFirst({
        where: eq(links.proposalId, captured.proposalId),
      }),
    ).toMatchObject({
      open: false,
      sourcePath: "docs/guide.md",
      targetPath: "docs/guide.md",
    });
    const status = await getGitProposal(f.teamId, captured.proposalId);
    const page = await listGitProposals(f.teamId);
    expect(page.items).toEqual([status]);
    expect(status).toMatchObject({
      status: "canceled",
      title: "Restricted documentation proposal",
      diagnostics: [],
      captured: [
        {
          documentId: f.doc.documentId,
          draftVersion: 1,
          sourcePath: "docs/guide.md",
          targetPath: "docs/guide.md",
        },
      ],
    });
    expect(JSON.stringify(status)).not.toMatch(
      /Original private draft|actorCredential|keyId/,
    );
    expect(
      await db.query.documentationGitChecks.findFirst({
        where: eq(checks.checkId, check.checkId),
      }),
    ).toMatchObject({
      status: "superseded",
      leaseToken: null,
      result: { headSha: "a".repeat(40), diagnostics: [] },
    });
    await expect(assertGitProposalWriteAuthority(identity)).rejects.toMatchObject({
      code: "GITHUB_SUPERSEDED",
    });
    expect(
      await db.query.documentationGitChecks.findFirst({
        where: eq(checks.checkId, publicationCheck.checkId),
      }),
    ).toMatchObject({
      status: "superseded",
      leaseToken: null,
      publicationResult: { commitSha: "a".repeat(40), diagnostics: [] },
    });
  });
});
