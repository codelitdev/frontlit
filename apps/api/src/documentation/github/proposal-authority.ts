import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import {
  documentationGitBindings as bindings,
  documentationGitProposals as proposals,
  documents,
} from "../../db/schema";
import { lockSettings } from "../authoring";
import { documentationReadAllowed } from "../publications";
import { GitHubDocsError } from "./app";
import { assertGitPublisherCredential } from "./publisher";

/** Fresh local check immediately before every remote mutation. Only a worker
 * that has persisted a validated writing intent and still owns its lease may write.
 * Network work stays outside this short transaction. */
export type GitProposalLease = {
  teamId: string;
  proposalId: string;
  leaseToken: string;
};
type ProposalTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Proposal = typeof proposals.$inferSelect;
type Binding = typeof bindings.$inferSelect;
/** The callback is local database work only, under the same settings lock as
 * authoring, grants and purge. Never put a provider request inside it. */
export async function withGitProposalAuthority<T>(
  input: GitProposalLease,
  allowedStatuses: readonly Proposal["status"][],
  operation: (
    tx: ProposalTransaction,
    proposal: Proposal,
    binding: Binding,
  ) => Promise<T>,
) {
  return db.transaction(async (tx) => {
    const settings = await lockSettings(tx, input.teamId);
    const proposal = await tx.query.documentationGitProposals.findFirst({
      where: and(
        eq(proposals.teamId, input.teamId),
        eq(proposals.proposalId, input.proposalId),
      ),
    });
    const binding = await tx.query.documentationGitBindings.findFirst({
      where: eq(bindings.teamId, input.teamId),
    });
    if (
      !proposal ||
      !allowedStatuses.includes(proposal.status) ||
      !proposal.changes.length ||
      !input.leaseToken ||
      proposal.leaseToken !== input.leaseToken ||
      !proposal.leaseExpiresAt ||
      proposal.leaseExpiresAt <= new Date() ||
      settings.source !== "git" ||
      !binding ||
      binding.status !== "connected" ||
      !binding.capabilities.read ||
      binding.generation !== proposal.connectionGeneration ||
      binding.grantVersion !== proposal.grantVersion
    )
      throw new GitHubDocsError("GITHUB_SUPERSEDED", 409);
    if (
      !(proposal.mode === "pull_request"
        ? binding.capabilities.proposals
        : binding.capabilities.directCommit)
    )
      throw new GitHubDocsError("GITHUB_WRITE_PERMISSION_REQUIRED", 403);
    await assertGitPublisherCredential(input.teamId, proposal.actorCredential, tx);
    for (const change of proposal.changes) {
      const doc = await tx.query.documents.findFirst({
        where: and(
          eq(documents.teamId, input.teamId),
          eq(documents.documentId, change.documentId),
          eq(documents.kind, "doc"),
        ),
      });
      // Later draft edits are allowed, but purge of an identity blocks
      // publishing its captured private text, even if the worker already prepared it.
      if (!doc || !(await documentationReadAllowed(input.teamId, doc, false, tx)))
        throw new GitHubDocsError("GITHUB_PROPOSAL_UNAVAILABLE", 409);
    }
    await tx
      .update(proposals)
      .set({ leaseExpiresAt: new Date(Date.now() + 120_000) })
      .where(
        and(
          eq(proposals.proposalId, input.proposalId),
          eq(proposals.leaseToken, input.leaseToken),
        ),
      );
    return operation(tx, proposal, binding);
  });
}
export async function assertGitProposalWriteAuthority(input: GitProposalLease) {
  if (process.env.DOCS_RESTORE_PENDING === "true")
    throw new GitHubDocsError("RESTORE_PENDING", 409);
  await withGitProposalAuthority(input, ["writing"], async () => {});
}
