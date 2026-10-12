import { randomUUID } from "node:crypto";
import { and, asc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { DocsContentError } from "@frontlit/text-editor/docs";
import { db } from "../../db/client";
import {
  documentationGitProposals as proposals,
  documentationGitProposalDocuments as links,
} from "../../db/schema";
import { lockSettings } from "../authoring";
import { DocsGitHubApp, GitHubDocsError, getDocsGitHubAppConfig } from "./app";
import {
  withGitProposalAuthority,
  assertGitProposalWriteAuthority,
  type GitProposalLease,
} from "./proposal-authority";
import { planGitProposalPatch } from "./proposal-patch";
import { readGitBindingAccess, enqueueGitSync, markGitAccessLost } from "./state";
import { enqueueGitPrCheck } from "./check-worker";
import { validateGitManifest } from "./source";

type Proposal = typeof proposals.$inferSelect;
const LEASE_MS = 120_000;
/** Prepared work and response-lost writing work share the same lease discipline. */
export async function claimGitProposalWrite(teamId?: string) {
  if (process.env.DOCS_RESTORE_PENDING === "true") return null;
  const due = and(
    inArray(proposals.status, ["prepared", "writing"]),
    lte(proposals.nextAttemptAt, sql`now()`),
    or(isNull(proposals.leaseExpiresAt), lte(proposals.leaseExpiresAt, sql`now()`)),
  );
  const candidates = await db.query.documentationGitProposals.findMany({
    where: and(due, teamId ? eq(proposals.teamId, teamId) : undefined),
    orderBy: [asc(proposals.nextAttemptAt), asc(proposals.createdAt)],
    limit: 10,
  });
  for (const candidate of candidates) {
    const [row] = await db
      .update(proposals)
      .set({
        leaseToken: randomUUID(),
        leaseExpiresAt: new Date(Date.now() + LEASE_MS),
        attempts: candidate.attempts + 1,
      })
      .where(and(eq(proposals.proposalId, candidate.proposalId), due))
      .returning();
    if (row) return row;
  }
  return null;
}
async function renew(identity: GitProposalLease) {
  const [row] = await db
    .update(proposals)
    .set({ leaseExpiresAt: new Date(Date.now() + LEASE_MS) })
    .where(
      and(
        eq(proposals.proposalId, identity.proposalId),
        eq(proposals.teamId, identity.teamId),
        eq(proposals.leaseToken, identity.leaseToken),
        eq(proposals.status, "writing"),
        gt(proposals.leaseExpiresAt, new Date()),
      ),
    )
    .returning();
  if (!row) throw new GitHubDocsError("GITHUB_SUPERSEDED", 409);
}
function unavailable(): never {
  throw new GitHubDocsError("GITHUB_PROPOSAL_RECOVERY_CONFLICT", 409);
}
/** Domain entry point requires a fresh or recovered writing lease.
 * Every Git mutation invokes the fresh authority guard. */
export async function writeGitProposal(
  proposal: Proposal,
  app: DocsGitHubApp,
  webOrigin: string,
) {
  if (!proposal.leaseToken) throw new GitHubDocsError("GITHUB_SUPERSEDED", 409);
  const identity = {
    teamId: proposal.teamId,
    proposalId: proposal.proposalId,
    leaseToken: proposal.leaseToken,
  };
  const context = await withGitProposalAuthority(
    identity,
    ["prepared", "writing"],
    async (tx, current, binding) => {
      if (!current.baseSha || !current.branch) unavailable();
      const [writing] = await tx
        .update(proposals)
        .set({ status: "writing" })
        .where(eq(proposals.proposalId, current.proposalId))
        .returning();
      return { proposal: writing, binding };
    },
  );
  let current = context.proposal;
  const guard = () => assertGitProposalWriteAuthority(identity);
  const access = await readGitBindingAccess(context.binding, app);
  const owner = access.repository.owner.login,
    name = access.repository.name;
  const installation = await app.installation(Number(context.binding.installationId));
  if (
    installation.id !== Number(context.binding.installationId) ||
    installation.suspended_at ||
    installation.permissions.contents !== "write" ||
    installation.permissions.checks !== "write" ||
    (current.mode === "pull_request" &&
      installation.permissions.pull_requests !== "write")
  )
    throw new GitHubDocsError("GITHUB_WRITE_PERMISSION_REQUIRED", 403);
  await guard();
  const { token } = await app.installationToken(
    Number(context.binding.installationId),
    Number(context.binding.repositoryId),
    current.mode === "pull_request" ? "proposal" : "direct",
  );
  // Before the first remote object, use the latest head when the selected-file
  // preconditions still hold. After an object is persisted, its base is fixed
  // for deterministic recovery; direct ref advancement checks that parent again.
  const updated = current.updatesProposalId
    ? await db.query.documentationGitProposals.findFirst({
        where: and(
          eq(proposals.teamId, current.teamId),
          eq(proposals.proposalId, current.updatesProposalId),
        ),
      })
    : null;
  if (current.updatesProposalId && !updated?.branch)
    throw new GitHubDocsError("PROPOSAL_NOT_OPEN", 409);
  const planningSha =
    !current.treeSha && !current.commitSha
      ? await app.branchHead(
          token,
          owner,
          name,
          updated?.branch ?? context.binding.branch,
        )
      : current.baseSha!;
  const baseCommit = await app.commit(token, owner, name, planningSha);
  const entries = await app.tree(token, owner, name, baseCommit.tree.sha);
  const plan = await planGitProposalPatch({
    commitSha: planningSha,
    directory: context.binding.directory,
    entries,
    changes: current.changes,
    readBlob: async (sha) => {
      await renew(identity);
      return app.blob(token, owner, name, sha);
    },
  });
  await renew(identity);
  const report = await validateGitManifest(current.teamId, plan.manifest);
  if (!report.publishable) throw new DocsContentError(report.diagnostics);
  await guard();
  async function persist(patch: Partial<typeof proposals.$inferInsert>) {
    current = await withGitProposalAuthority(identity, ["writing"], async (tx, row) => {
      const [updated] = await tx
        .update(proposals)
        .set(patch)
        .where(
          and(
            eq(proposals.proposalId, row.proposalId),
            eq(proposals.leaseToken, identity.leaseToken),
          ),
        )
        .returning();
      return updated;
    });
  }
  if (current.baseSha !== planningSha) await persist({ baseSha: planningSha });
  if (!current.treeSha) {
    const treeSha = await app.createProposalTree(
      token,
      owner,
      name,
      {
        baseTreeSha: baseCommit.tree.sha,
        directory: context.binding.directory,
        edits: plan.edits,
      },
      guard,
    );
    await persist({ treeSha });
  }
  if (!current.commitSha) {
    const commitSha = await app.createProposalCommit(
      token,
      owner,
      name,
      {
        parentSha: current.baseSha!,
        treeSha: current.treeSha!,
        proposalId: current.proposalId,
        title: current.title,
        createdAt: current.createdAt.toISOString().replace(/\.\d{3}Z$/, "Z"),
      },
      guard,
    );
    await persist({ commitSha });
  }
  const commit = await app.commit(token, owner, name, current.commitSha!);
  if (
    commit.tree.sha !== current.treeSha ||
    commit.parents?.length !== 1 ||
    commit.parents[0].sha !== current.baseSha
  )
    unavailable();

  if (updated) {
    // Append to the open PR's branch. A closed or merged PR is never reopened.
    const openPr = await app.findProposalPullRequest(token, owner, name, {
      proposalId: updated.proposalId,
      base: context.binding.branch,
      repositoryId: Number(context.binding.repositoryId),
    });
    if (!openPr || openPr.state !== "open" || openPr.merged)
      throw new GitHubDocsError("PROPOSAL_NOT_OPEN", 409);
    const head = await app.branchHead(token, owner, name, updated.branch!);
    if (head !== current.commitSha) {
      if (head !== current.baseSha) {
        if (!(await app.isAncestor(token, owner, name, current.commitSha!, head)))
          throw new GitHubDocsError("UPSTREAM_CHANGED", 409);
      } else
        await app.advanceBranch(
          token,
          owner,
          name,
          {
            branch: updated.branch!,
            expectedHead: current.baseSha!,
            commitSha: current.commitSha!,
          },
          guard,
        );
    }
    return withGitProposalAuthority(identity, ["writing"], async (tx, row) => {
      const target = await tx.query.documentationGitProposals.findFirst({
        where: and(
          eq(proposals.teamId, row.teamId),
          eq(proposals.proposalId, updated.proposalId),
        ),
      });
      if (!target || target.status !== "open")
        throw new GitHubDocsError("PROPOSAL_NOT_OPEN", 409);
      // The open PR now carries these versions. Keep its original base provenance.
      const merged = [...target.changes];
      for (const change of row.changes) {
        const at = merged.findIndex((c) => c.documentId === change.documentId);
        if (at < 0) merged.push(change);
        else merged[at] = { ...change, base: merged[at].base };
      }
      await tx
        .update(links)
        .set({ open: false })
        .where(eq(links.proposalId, row.proposalId));
      for (const change of row.changes) {
        const patch = {
          draftVersion: change.draftVersion,
          targetPath: change.target?.sourcePath ?? null,
        };
        const [existing] = await tx
          .update(links)
          .set(patch)
          .where(
            and(
              eq(links.proposalId, target.proposalId),
              eq(links.documentId, change.documentId),
            ),
          )
          .returning();
        if (!existing)
          await tx.insert(links).values({
            teamId: row.teamId,
            proposalId: target.proposalId,
            documentId: change.documentId,
            sourcePath: change.base?.sourcePath ?? null,
            ...patch,
          });
      }
      await tx
        .update(proposals)
        .set({ changes: merged, commitSha: row.commitSha })
        .where(eq(proposals.proposalId, target.proposalId));
      const [finished] = await tx
        .update(proposals)
        .set({
          status: "updated",
          pullRequestNumber: openPr.number,
          pullRequestUrl: openPr.url,
          diagnostics: report.diagnostics,
          leaseToken: null,
          leaseExpiresAt: null,
          finishedAt: new Date(),
        })
        .where(eq(proposals.proposalId, row.proposalId))
        .returning();
      await enqueueGitPrCheck(row.teamId, openPr.number, tx);
      return finished;
    });
  }
  let pr: {
    number: number;
    url: string;
    state?: "open" | "closed";
    merged?: boolean;
    mergeCommitSha?: string | null;
  } | null = null;
  if (current.mode === "pull_request") {
    // Recover first, including review edits or a closed PR. Never replace a
    // reviewer's branch or create another PR for this deterministic proposal.
    pr = await app.findProposalPullRequest(token, owner, name, {
      proposalId: current.proposalId,
      base: context.binding.branch,
      repositoryId: Number(context.binding.repositoryId),
    });
    if (!pr) {
      let existing: string | null;
      try {
        existing = await app.branchHead(token, owner, name, current.branch!);
      } catch (error) {
        if (
          error instanceof GitHubDocsError &&
          error.code === "GITHUB_REFERENCE_UNAVAILABLE" &&
          error.status === 404
        )
          existing = null;
        else throw error;
      }
      if (existing && existing !== current.commitSha) unavailable();
      if (!existing) {
        try {
          await app.createProposalBranch(
            token,
            owner,
            name,
            current.proposalId,
            current.commitSha!,
            guard,
          );
        } catch (error) {
          if (
            !(error instanceof GitHubDocsError) ||
            error.code !== "GITHUB_WRITE_REJECTED"
          )
            throw error;
          if (
            (await app.branchHead(token, owner, name, current.branch!)) !==
            current.commitSha
          )
            unavailable();
        }
      }
      const details = new URL(
        `/content/documentation/github/proposals/${current.proposalId}`,
        webOrigin,
      );
      pr = await app.createProposalPullRequest(
        token,
        owner,
        name,
        {
          proposalId: current.proposalId,
          base: context.binding.branch,
          title: current.title,
          documentCount: current.changes.length,
          detailsUrl: details.toString(),
        },
        guard,
      );
    }
  } else {
    const head = await app.branchHead(token, owner, name, context.binding.branch);
    if (head !== current.commitSha) {
      if (head !== current.baseSha) {
        if (!(await app.isAncestor(token, owner, name, current.commitSha!, head)))
          throw new GitHubDocsError("UPSTREAM_CHANGED", 409);
      } else
        await app.advanceBranch(
          token,
          owner,
          name,
          {
            branch: context.binding.branch,
            expectedHead: current.baseSha!,
            commitSha: current.commitSha!,
          },
          guard,
        );
    }
  }
  return withGitProposalAuthority(identity, ["writing"], async (tx, row, binding) => {
    const closed = pr?.state === "closed" && !pr.merged;
    const merged = row.mode === "direct" || !!pr?.merged;
    const [finished] = await tx
      .update(proposals)
      .set({
        status: closed ? "closed" : merged ? "merged" : "open",
        mergedCommitSha:
          row.mode === "direct" ? row.commitSha : (pr?.mergeCommitSha ?? null),
        pullRequestNumber: pr?.number ?? null,
        pullRequestUrl: pr?.url ?? null,
        diagnostics: report.diagnostics,
        leaseToken: null,
        leaseExpiresAt: null,
        finishedAt: closed ? new Date() : null,
        nextAttemptAt: new Date(Date.now() + 60_000),
      })
      .where(eq(proposals.proposalId, row.proposalId))
      .returning();
    if (closed)
      await tx
        .update(links)
        .set({ open: false })
        .where(eq(links.proposalId, row.proposalId));
    if (merged)
      await enqueueGitSync(
        row.teamId,
        { expectedGeneration: binding.generation, trigger: "reconcile" },
        tx,
      );
    if (pr && !closed && !merged) await enqueueGitPrCheck(row.teamId, pr.number, tx);
    return finished;
  });
}
/** Retries preserve persisted tree/commit references and immutable input. */
export async function processGitProposalWrite(
  teamId?: string,
  injectedApp?: DocsGitHubApp,
  injectedWebOrigin?: string,
) {
  const proposal = await claimGitProposalWrite(teamId);
  if (!proposal) return null;
  try {
    const config = injectedApp && injectedWebOrigin ? null : getDocsGitHubAppConfig();
    return await writeGitProposal(
      proposal,
      injectedApp ?? new DocsGitHubApp(config!),
      injectedWebOrigin ?? config!.webOrigin,
    );
  } catch (error) {
    const code =
      error instanceof GitHubDocsError
        ? error.code
        : error instanceof DocsContentError
          ? (error.diagnostics[0]?.code ?? "INVALID_DOCUMENT")
          : "GITHUB_UNAVAILABLE";
    if (["GITHUB_ACCESS_LOST", "GITHUB_OWNER_CHANGED"].includes(code))
      await markGitAccessLost(proposal.teamId, proposal.connectionGeneration, code);
    const limited = code === "GITHUB_RATE_LIMITED",
      retry =
        code === "RESTORE_PENDING" ||
        limited ||
        (code === "GITHUB_UNAVAILABLE" && proposal.attempts < 5);
    return db.transaction(async (tx) => {
      await lockSettings(tx, proposal.teamId);
      const current = await tx.query.documentationGitProposals.findFirst({
        where: eq(proposals.proposalId, proposal.proposalId),
      });
      if (
        !current ||
        !["prepared", "writing"].includes(current.status) ||
        current.leaseToken !== proposal.leaseToken ||
        !current.leaseExpiresAt ||
        current.leaseExpiresAt <= new Date()
      )
        return current;
      const [failed] = await tx
        .update(proposals)
        .set({
          status: retry
            ? current.status
            : [
                  "UPSTREAM_CHANGED",
                  "GITHUB_WRITE_REJECTED",
                  "GITHUB_PROPOSAL_RECOVERY_CONFLICT",
                ].includes(code)
              ? "conflict"
              : code === "GITHUB_SUPERSEDED"
                ? "canceled"
                : "failed",
          diagnostics:
            error instanceof DocsContentError ? error.diagnostics : [{ code }],
          leaseToken: null,
          leaseExpiresAt: null,
          attempts:
            limited || code === "RESTORE_PENDING"
              ? current.attempts - 1
              : current.attempts,
          nextAttemptAt: new Date(
            Math.max(
              error instanceof GitHubDocsError ? (error.retryAt?.getTime() ?? 0) : 0,
              Date.now() + Math.min(300_000, 5000 * 2 ** (current.attempts - 1)),
            ),
          ),
          finishedAt: retry ? null : new Date(),
        })
        .where(
          and(
            eq(proposals.proposalId, current.proposalId),
            eq(proposals.leaseToken, proposal.leaseToken!),
          ),
        )
        .returning();
      if (!retry)
        await tx
          .update(links)
          .set({ open: false })
          .where(eq(links.proposalId, current.proposalId));
      return failed;
    });
  }
}
