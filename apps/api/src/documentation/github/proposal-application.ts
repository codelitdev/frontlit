import { and, eq, inArray } from "drizzle-orm";
import { lockSettings } from "../authoring";
import { documentationGitBindings as bindings } from "../../db/schema";
import { db } from "../../db/client";
import { documentationGitProposals as proposals } from "../../db/schema";
import { DocsGitHubApp, GitHubDocsError } from "./app";
import type { GitBinding } from "./state";

type Proposal = typeof proposals.$inferSelect;
export function sameProposalSource(proposal: Proposal, binding: GitBinding) {
  const context = proposal.sourceContext;
  // Missing legacy identity permits only the original unchanged generation.
  return context
    ? context.installationId === binding.installationId &&
        context.repositoryId === binding.repositoryId &&
        context.ownerId === binding.ownerId &&
        context.branch === binding.branch &&
        context.directory === binding.directory
    : proposal.connectionGeneration === binding.generation;
}
export type IncludedGitProposal = {
  proposalId: string;
  mergedCommitSha: string;
  apply: boolean;
};

/** Squash/rebase PRs use the provider's actual merged commit, not the original
 * proposal head. Only proven ancestry in this exact publishing head is applied. */
export async function includedGitProposals(
  binding: GitBinding,
  head: string,
  app: DocsGitHubApp,
  access: { token: string; repository: { owner: { login: string }; name: string } },
  heartbeat: () => Promise<void> = async () => {},
) {
  const candidates = await db.query.documentationGitProposals.findMany({
    where: and(
      eq(proposals.teamId, binding.teamId),
      inArray(proposals.status, ["open", "merged", "canceled"]),
    ),
    limit: 1001,
  });
  if (candidates.length > 1000)
    throw new GitHubDocsError("GITHUB_RECONCILIATION_LIMIT", 409);
  const result: IncludedGitProposal[] = [];
  let reviewToken: string | undefined;
  for (const proposal of candidates) {
    await heartbeat();
    if (!sameProposalSource(proposal, binding)) continue;
    let mergedCommitSha = proposal.mergedCommitSha;
    if (
      proposal.status === "open" ||
      (proposal.status === "merged" &&
        proposal.mode === "pull_request" &&
        !mergedCommitSha)
    ) {
      reviewToken ??= (
        await app.installationToken(
          Number(binding.installationId),
          Number(binding.repositoryId),
          "review",
        )
      ).token;
      const pr = await app.findProposalPullRequest(
        reviewToken,
        access.repository.owner.login,
        access.repository.name,
        {
          proposalId: proposal.proposalId,
          base: binding.branch,
          repositoryId: Number(binding.repositoryId),
        },
      );
      if (!pr || pr.number !== proposal.pullRequestNumber || !pr.merged) continue;
      mergedCommitSha = pr.mergeCommitSha;
      await db.transaction(async (tx) => {
        await lockSettings(tx, binding.teamId);
        const currentBinding = await tx.query.documentationGitBindings.findFirst({
          where: eq(bindings.teamId, binding.teamId),
        });
        if (
          !currentBinding ||
          currentBinding.generation !== binding.generation ||
          currentBinding.status !== "connected" ||
          !currentBinding.capabilities.read
        )
          throw new GitHubDocsError("GITHUB_SUPERSEDED", 409);
        await tx
          .update(proposals)
          .set({
            status: "merged",
            mergedCommitSha,
            leaseToken: null,
            leaseExpiresAt: null,
          })
          .where(
            and(
              eq(proposals.proposalId, proposal.proposalId),
              inArray(proposals.status, ["open", "merged"]),
            ),
          );
      });
    }
    if (!mergedCommitSha) continue;
    if (
      mergedCommitSha === head ||
      (await app.isAncestor(
        access.token,
        access.repository.owner.login,
        access.repository.name,
        mergedCommitSha,
        head,
      ))
    )
      result.push({
        proposalId: proposal.proposalId,
        mergedCommitSha,
        apply: proposal.status !== "canceled",
      });
    await heartbeat();
  }
  return result;
}
