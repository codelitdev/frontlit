import { cleanupDocumentationEvidence } from "./improvements";
import { processGitSync, reconcileGitSources } from "./github/worker";
import { reconcileGitPrChecks } from "./github/check-reconciliation";
import { processGitCheck } from "./github/check-worker";
import { reconcileGitPublicationChecks } from "./github/publication-checks";
import { processGitProposalQueue } from "./github/proposal-queue";
import { processGitMigrationWrite } from "./github/migration-write-worker";
import { reconcileGitMigrationPr } from "./github/migration-reconciliation";
import {
  processPublication,
  deliverDocumentationEvent,
  cleanupDocumentation,
} from "./publications";
import { logger } from "../services/log";
export function startDocumentationPublicationWorker(intervalMs = 2000) {
  let stopped = false;
  let lastCleanup = 0;
  let lastGitReconcile = 0;
  async function tick() {
    if (stopped) return;
    try {
      // Bounded work per tick; an individual tenant cannot drain forever.
      if (Date.now() - lastGitReconcile > 60_000) {
        await reconcileGitSources();
        await reconcileGitPrChecks();
        lastGitReconcile = Date.now();
      }
      await processGitSync();
      await processGitProposalQueue();
      await processGitMigrationWrite();
      await reconcileGitMigrationPr();
      await reconcileGitPublicationChecks();
      await processGitCheck();
      for (let i = 0; i < 5 && !stopped; i++) if (!(await processPublication())) break;
      for (let i = 0; i < 10 && !stopped; i++)
        if (!(await deliverDocumentationEvent())) break;
      await cleanupDocumentationEvidence();
      if (Date.now() - lastCleanup > 86400000) {
        await cleanupDocumentation();
        lastCleanup = Date.now();
      }
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Documentation publication worker failed",
      );
    }
    if (!stopped) setTimeout(tick, intervalMs);
  }
  setTimeout(tick, intervalMs);
  return () => {
    stopped = true;
  };
}
