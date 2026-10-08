import { randomUUID } from "node:crypto";
import { and, asc, eq, gt, lte, or, sql } from "drizzle-orm";
import { DocsContentError } from "@frontlit/text-editor/docs";
import { db } from "../../db/client";
import {
  documentationGitProposals as proposals,
  documentationGitProposalDocuments as proposalDocs,
} from "../../db/schema";
import { lockSettings } from "../authoring";
import { DocsGitHubApp, GitHubDocsError, getDocsGitHubAppConfig } from "./app";
import { withGitProposalAuthority, type GitProposalLease } from "./proposal-authority";
import { planGitProposalPatch } from "./proposal-patch";
import { readGitBindingAccess, markGitAccessLost } from "./state";
import { validateGitManifest } from "./source";

const LEASE_MS = 120_000;
type Proposal = typeof proposals.$inferSelect;
/** Compare-and-swap claims prevent concurrent workers from taking one capture. */
export async function claimGitProposal(teamId?: string) {
  const due = or(
    and(eq(proposals.status, "queued"), lte(proposals.nextAttemptAt, sql`now()`)),
    and(eq(proposals.status, "validating"), lte(proposals.leaseExpiresAt, sql`now()`)),
  );
  const candidates = await db.query.documentationGitProposals.findMany({
    where: and(due, teamId ? eq(proposals.teamId, teamId) : undefined),
    orderBy: [asc(proposals.nextAttemptAt), asc(proposals.createdAt)],
    limit: 10,
  });
  for (const candidate of candidates) {
    const [claimed] = await db
      .update(proposals)
      .set({
        status: "validating",
        attempts: candidate.attempts + 1,
        leaseToken: randomUUID(),
        leaseExpiresAt: new Date(Date.now() + LEASE_MS),
      })
      .where(and(eq(proposals.proposalId, candidate.proposalId), due))
      .returning();
    if (claimed) return claimed;
  }
  return null;
}
function lease(proposal: Proposal): GitProposalLease {
  if (!proposal.leaseToken) throw new GitHubDocsError("GITHUB_SUPERSEDED", 409);
  return {
    teamId: proposal.teamId,
    proposalId: proposal.proposalId,
    leaseToken: proposal.leaseToken,
  };
}
/** Blob reads can take time. Renewal cannot revive an expired or replaced lease. */
async function renew(input: GitProposalLease) {
  const [row] = await db
    .update(proposals)
    .set({ leaseExpiresAt: new Date(Date.now() + LEASE_MS) })
    .where(
      and(
        eq(proposals.proposalId, input.proposalId),
        eq(proposals.teamId, input.teamId),
        eq(proposals.status, "validating"),
        eq(proposals.leaseToken, input.leaseToken),
        gt(proposals.leaseExpiresAt, new Date()),
      ),
    )
    .returning();
  if (!row) throw new GitHubDocsError("GITHUB_SUPERSEDED", 409);
}
/** Read-only provider preparation. Entire merged candidate validation precedes
 * the durable prepared state. Public docs and captured local versions stay intact.
 * Writing/review processing and scheduler wiring are separate next steps. */
export async function prepareGitProposal(proposal: Proposal, app: DocsGitHubApp) {
  const identity = lease(proposal);
  const context = await withGitProposalAuthority(
    identity,
    ["validating"],
    async (_tx, current, binding) => ({ current, binding }),
  );
  const { token, repository } = await readGitBindingAccess(context.binding, app);
  const head = await app.branchHead(
    token,
    repository.owner.login,
    repository.name,
    context.binding.branch,
  );
  await renew(identity);
  const entries = await app.commitTree(
    token,
    repository.owner.login,
    repository.name,
    head,
  );
  const plan = await planGitProposalPatch({
    commitSha: head,
    directory: context.binding.directory,
    entries,
    changes: context.current.changes,
    readBlob: async (sha) => {
      await renew(identity);
      return app.blob(token, repository.owner.login, repository.name, sha);
    },
  });
  await renew(identity);
  const report = await validateGitManifest(proposal.teamId, plan.manifest);
  if (!report.publishable) throw new DocsContentError(report.diagnostics);
  return withGitProposalAuthority(
    identity,
    ["validating"],
    async (tx, current, binding) => {
      const [prepared] = await tx
        .update(proposals)
        .set({
          status: "prepared",
          baseSha: head,
          branch:
            current.mode === "pull_request"
              ? `frontlit/docs/${current.proposalId}`
              : binding.branch,
          diagnostics: report.diagnostics,
          leaseToken: null,
          leaseExpiresAt: null,
        })
        .where(
          and(
            eq(proposals.proposalId, current.proposalId),
            eq(proposals.leaseToken, identity.leaseToken),
          ),
        )
        .returning();
      return prepared;
    },
  );
}
/** Queue preparation entry point; terminal failures release one-open ownership.
 * Transport/rate-limit retries retain exactly the admitted Markdown capture. */
export async function processGitProposalPreparation(
  teamId?: string,
  injectedApp?: DocsGitHubApp,
) {
  const proposal = await claimGitProposal(teamId);
  if (!proposal) return null;
  try {
    return await prepareGitProposal(
      proposal,
      injectedApp ?? new DocsGitHubApp(getDocsGitHubAppConfig()),
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
    const limited = code === "GITHUB_RATE_LIMITED";
    const retry = limited || (code === "GITHUB_UNAVAILABLE" && proposal.attempts < 5);
    return db.transaction(async (tx) => {
      await lockSettings(tx, proposal.teamId);
      const current = await tx.query.documentationGitProposals.findFirst({
        where: eq(proposals.proposalId, proposal.proposalId),
      });
      if (
        current?.status !== "validating" ||
        current.leaseToken !== proposal.leaseToken ||
        !current.leaseExpiresAt ||
        current.leaseExpiresAt <= new Date()
      )
        return current;
      const [result] = await tx
        .update(proposals)
        .set({
          status: retry
            ? "queued"
            : code === "UPSTREAM_CHANGED"
              ? "conflict"
              : code === "GITHUB_SUPERSEDED"
                ? "canceled"
                : "failed",
          diagnostics:
            error instanceof DocsContentError ? error.diagnostics : [{ code }],
          leaseToken: null,
          leaseExpiresAt: null,
          attempts: limited ? proposal.attempts - 1 : proposal.attempts,
          nextAttemptAt: new Date(
            Math.max(
              error instanceof GitHubDocsError ? (error.retryAt?.getTime() ?? 0) : 0,
              Date.now() + Math.min(300_000, 5000 * 2 ** (proposal.attempts - 1)),
            ),
          ),
          finishedAt: retry ? null : new Date(),
        })
        .where(
          and(
            eq(proposals.proposalId, proposal.proposalId),
            eq(proposals.leaseToken, proposal.leaseToken!),
          ),
        )
        .returning();
      if (!retry)
        await tx
          .update(proposalDocs)
          .set({ open: false })
          .where(eq(proposalDocs.proposalId, proposal.proposalId));
      return result;
    });
  }
}
