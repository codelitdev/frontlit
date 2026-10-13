import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull, isNotNull, lte, or, sql } from "drizzle-orm";
import { db } from "../../db/client";
import {
  documentationGitBindings as bindings,
  documentationGitProposals as proposals,
  documentationGitProposalDocuments as links,
} from "../../db/schema";
import { lockSettings } from "../authoring";
import { DocsGitHubApp, GitHubDocsError, getDocsGitHubAppConfig } from "./app";
import { enqueueGitSync, markGitAccessLost, readGitBindingAccess } from "./state";
import { sameProposalSource } from "./proposal-application";

type Proposal = typeof proposals.$inferSelect;
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const POLL_MS = 60_000;
const LEASE_MS = 120_000;

/** Only remote reads: revoked publisher credentials do not prevent observing a
 * PR already created. Connection identity and current read consent still apply. */
export async function claimGitProposalReview(teamId?: string) {
  const due = and(
    or(
      and(eq(proposals.status, "open"), eq(proposals.mode, "pull_request")),
      and(
        eq(proposals.status, "canceled"),
        isNotNull(proposals.commitSha),
        isNull(proposals.mergedCommitSha),
      ),
    ),
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
      })
      .where(and(eq(proposals.proposalId, candidate.proposalId), due))
      .returning();
    if (row) return row;
  }
  return null;
}

async function withReviewLease<T>(
  proposal: Proposal,
  callback: (
    tx: Transaction,
    current: Proposal,
    binding: typeof bindings.$inferSelect,
  ) => Promise<T>,
) {
  return db.transaction(async (tx) => {
    const settings = await lockSettings(tx, proposal.teamId);
    const current = await tx.query.documentationGitProposals.findFirst({
      where: eq(proposals.proposalId, proposal.proposalId),
    });
    const binding = await tx.query.documentationGitBindings.findFirst({
      where: eq(bindings.teamId, proposal.teamId),
    });
    if (
      !current ||
      current.status !== proposal.status ||
      current.leaseToken !== proposal.leaseToken ||
      !current.leaseExpiresAt ||
      current.leaseExpiresAt <= new Date() ||
      settings.source !== "git" ||
      binding?.status !== "connected" ||
      !binding.capabilities.read ||
      !sameProposalSource(current, binding)
    )
      throw new GitHubDocsError("GITHUB_SUPERSEDED", 409);
    return callback(tx, current, binding);
  });
}

export async function processGitProposalReview(
  teamId?: string,
  injectedApp?: DocsGitHubApp,
) {
  const proposal = await claimGitProposalReview(teamId);
  if (!proposal) return null;
  try {
    const binding = await withReviewLease(
      proposal,
      async (_tx, _row, binding) => binding,
    );
    const app = injectedApp ?? new DocsGitHubApp(getDocsGitHubAppConfig());
    const access = await readGitBindingAccess(binding, app);
    const { token } = await app.installationToken(
      Number(binding.installationId),
      Number(binding.repositoryId),
      "review",
    );
    if (proposal.status === "canceled" && proposal.mode === "direct") {
      const head = await app.branchHead(
        token,
        access.repository.owner.login,
        access.repository.name,
        binding.branch,
      );
      const included =
        head === proposal.commitSha ||
        (await app.isAncestor(
          token,
          access.repository.owner.login,
          access.repository.name,
          proposal.commitSha!,
          head,
        ));
      return await withReviewLease(proposal, async (tx, current, binding) => {
        const [updated] = await tx
          .update(proposals)
          .set({
            mergedCommitSha: included ? current.commitSha : null,
            diagnostics: current.diagnostics.filter(
              (diagnostic) => diagnostic.phase !== "review",
            ),
            leaseToken: null,
            leaseExpiresAt: null,
            nextAttemptAt: new Date(Date.now() + 5 * POLL_MS),
          })
          .where(eq(proposals.proposalId, current.proposalId))
          .returning();
        if (included)
          await enqueueGitSync(
            current.teamId,
            { expectedGeneration: binding.generation, trigger: "reconcile" },
            tx,
          );
        return updated;
      });
    }
    const pr = await app.findProposalPullRequest(
      token,
      access.repository.owner.login,
      access.repository.name,
      {
        proposalId: proposal.proposalId,
        base: binding.branch,
        repositoryId: Number(binding.repositoryId),
      },
    );
    // A missing/retargeted PR is not proof of closure, and cannot authorize a
    // replacement PR or release document ownership. Preserve the remote pointer.
    if (proposal.status === "canceled" && !pr) {
      // A branch can exist even when PR creation never finished. Inspect only;
      // absence is not permission to retry a canceled external write.
      try {
        const head = await app.branchHead(
          token,
          access.repository.owner.login,
          access.repository.name,
          `frontlit/docs/${proposal.proposalId}`,
        );
        if (head !== proposal.commitSha)
          throw new GitHubDocsError("GITHUB_PROPOSAL_RECOVERY_CONFLICT", 409);
      } catch (error) {
        if (
          !(error instanceof GitHubDocsError) ||
          error.code !== "GITHUB_REFERENCE_UNAVAILABLE" ||
          error.status !== 404
        )
          throw error;
      }
    } else if (
      !pr ||
      ((proposal.status !== "canceled" || proposal.pullRequestNumber !== null) &&
        pr.number !== proposal.pullRequestNumber)
    )
      throw new GitHubDocsError("GITHUB_PROPOSAL_RECOVERY_CONFLICT", 409);
    return await withReviewLease(proposal, async (tx, current, binding) => {
      const status =
        current.status === "canceled"
          ? "canceled"
          : pr!.merged
            ? "merged"
            : pr!.state === "closed"
              ? "closed"
              : "open";
      const [updated] = await tx
        .update(proposals)
        .set({
          status,
          mergedCommitSha: pr?.merged ? pr.mergeCommitSha : null,
          pullRequestNumber: pr?.number ?? current.pullRequestNumber,
          pullRequestUrl: pr?.url ?? current.pullRequestUrl,
          diagnostics: current.diagnostics.filter(
            (diagnostic) => diagnostic.phase !== "review",
          ),
          leaseToken: null,
          leaseExpiresAt: null,
          nextAttemptAt: new Date(
            Date.now() + (status === "canceled" ? 5 : 1) * POLL_MS,
          ),
          finishedAt:
            status === "canceled"
              ? current.finishedAt
              : status === "closed"
                ? new Date()
                : null,
        })
        .where(eq(proposals.proposalId, current.proposalId))
        .returning();
      if (status === "closed")
        await tx
          .update(links)
          .set({ open: false })
          .where(eq(links.proposalId, current.proposalId));
      if (pr?.merged)
        await enqueueGitSync(
          current.teamId,
          { expectedGeneration: binding.generation, trigger: "reconcile" },
          tx,
        );
      return updated;
    });
  } catch (error) {
    const code = error instanceof GitHubDocsError ? error.code : "GITHUB_UNAVAILABLE";
    if (["GITHUB_ACCESS_LOST", "GITHUB_OWNER_CHANGED"].includes(code))
      await markGitAccessLost(proposal.teamId, proposal.connectionGeneration, code);
    // Final local CAS protects a concurrent purge/pause from being undone.
    return db.transaction(async (tx) => {
      await lockSettings(tx, proposal.teamId);
      const current = await tx.query.documentationGitProposals.findFirst({
        where: eq(proposals.proposalId, proposal.proposalId),
      });
      if (
        current?.status !== proposal.status ||
        current.leaseToken !== proposal.leaseToken ||
        !current.leaseExpiresAt ||
        current.leaseExpiresAt <= new Date()
      )
        return current;
      const [updated] = await tx
        .update(proposals)
        .set({
          diagnostics: [
            ...current.diagnostics.filter(
              (diagnostic) => diagnostic.phase !== "review",
            ),
            { code, phase: "review" },
          ],
          leaseToken: null,
          leaseExpiresAt: null,
          nextAttemptAt: new Date(
            Math.max(
              Date.now() + POLL_MS,
              error instanceof GitHubDocsError ? (error.retryAt?.getTime() ?? 0) : 0,
            ),
          ),
        })
        .where(
          and(
            eq(proposals.proposalId, proposal.proposalId),
            eq(proposals.leaseToken, proposal.leaseToken!),
          ),
        )
        .returning();
      return updated;
    });
  }
}
