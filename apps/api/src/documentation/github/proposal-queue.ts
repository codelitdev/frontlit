import type { DocsGitHubApp } from "./app";
import { processGitProposalPreparation } from "./proposal-worker";
import { processGitProposalWrite } from "./proposal-write-worker";
import { processGitProposalReview } from "./proposal-review-worker";

/** Bounded production dispatcher. Preparation releases its lease atomically,
 * allowing writing to claim immediately. Existing write retries remain eligible
 * even when another proposal's preparation returns a terminal diagnostic. */
export async function processGitProposalQueue(
  teamId?: string,
  app?: DocsGitHubApp,
  webOrigin?: string,
) {
  if (process.env.DOCS_RESTORE_PENDING === "true") return null;
  const prepared = await processGitProposalPreparation(teamId, app);
  const written = await processGitProposalWrite(teamId, app, webOrigin);
  const reviewed = await processGitProposalReview(teamId, app);
  return reviewed ?? written ?? prepared;
}
