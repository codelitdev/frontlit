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
import { onDocumentationWorkerWake } from "./worker-wake";
export function startDocumentationPublicationWorker(intervalMs = 2000) {
  let stopped = false;
  let lastCleanup = 0;
  let lastGitReconcile = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let wokenWhileRunning = false;
  async function tick() {
    if (stopped) return;
    running = true;
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
    running = false;
    if (!stopped) timer = setTimeout(tick, wokenWhileRunning ? 0 : intervalMs);
    wokenWhileRunning = false;
  }
  onDocumentationWorkerWake(() => {
    if (running) {
      wokenWhileRunning = true;
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(tick, 0);
  });
  timer = setTimeout(tick, intervalMs);
  return () => {
    stopped = true;
    clearTimeout(timer);
    onDocumentationWorkerWake(null);
  };
}
