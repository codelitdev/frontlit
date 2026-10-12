import { and, eq, inArray, like, lte, or, sql } from "drizzle-orm";
import { db } from "../../db/client";
import {
  documentationGitMigrations as migrations,
  documentationGitPreflights as preflights,
  documentationGitJobs as jobs,
  documentationGitDeliveries as deliveries,
  rateLimitBuckets as buckets,
  documentationGitProposals as proposals,
  documentationGitChecks as checks,
} from "../../db/schema";
import { cleanupGitHubSetups } from "./setup";
const DAY = 24 * 60 * 60_000;
/** Bounded passes; active source files/publication proofs are never age-deleted. */
export async function cleanupGitHubDocumentation(now = new Date()) {
  const credentials = await cleanupGitHubSetups(now);
  const expired = await db.query.documentationGitMigrations.findMany({
    where: and(
      lte(migrations.expiresAt, now),
      inArray(migrations.status, ["planned", "verified"]),
    ),
    limit: 100,
  });
  if (expired.length)
    await db
      .update(migrations)
      .set({ status: "expired" })
      .where(
        inArray(
          migrations.planId,
          expired.map((p) => p.planId),
        ),
      );
  const cutoff = new Date(now.getTime() - 30 * DAY);
  // Keep minimal activated-plan equivalence metadata for the currently live base.
  // Only expired export bodies are collected, not the accepted identity proof.
  const exports = await db.query.documentationGitMigrations.findMany({
    where: and(
      or(
        and(eq(migrations.status, "activated"), lte(migrations.activatedAt, cutoff)),
        and(
          inArray(migrations.status, ["canceled", "expired"]),
          lte(migrations.expiresAt, cutoff),
        ),
      ),
      or(
        sql`jsonb_array_length(${migrations.files}) > 0`,
        sql`jsonb_array_length(${migrations.sections}) > 0`,
      ),
    ),
    limit: 100,
  });
  let exportsRemoved = 0;
  for (const plan of exports) {
    if (!plan.files.length && !plan.sections.length) continue;
    await db
      .update(migrations)
      .set({ files: [], sections: [] })
      .where(eq(migrations.planId, plan.planId));
    exportsRemoved++;
  }
  const snapshots = await db.query.documentationGitPreflights.findMany({
    where: lte(preflights.expiresAt, new Date(now.getTime() - 7 * DAY)),
    limit: 100,
  });
  if (snapshots.length)
    await db.delete(preflights).where(
      inArray(
        preflights.preflightId,
        snapshots.map((p) => p.preflightId),
      ),
    );
  const reports = await db.query.documentationGitJobs.findMany({
    where: and(
      lte(jobs.finishedAt, cutoff),
      sql`not exists (select 1 from documentation_git_checks where sync_run_id = ${jobs.runId} and status in ('queued', 'validating', 'reporting'))`,
      inArray(jobs.status, ["active", "failed", "superseded"]),
    ),
    limit: 100,
  });
  const closedProposals = await db.query.documentationGitProposals.findMany({
    where: and(
      lte(proposals.finishedAt, cutoff),
      inArray(proposals.status, [
        "published",
        "closed",
        "failed",
        "conflict",
        "canceled",
      ]),
    ),
    limit: 100,
  });
  if (closedProposals.length)
    await db.delete(proposals).where(
      inArray(
        proposals.proposalId,
        closedProposals.map((row) => row.proposalId),
      ),
    );
  if (reports.length)
    await db.delete(jobs).where(
      inArray(
        jobs.runId,
        reports.map((r) => r.runId),
      ),
    );
  const terminalChecks = await db.query.documentationGitChecks.findMany({
    where: and(
      lte(checks.finishedAt, cutoff),
      inArray(checks.status, ["delivered", "superseded"]),
    ),
    limit: 100,
  });
  if (terminalChecks.length)
    await db.delete(checks).where(
      and(
        inArray(
          checks.checkId,
          terminalChecks.map((row) => row.checkId),
        ),
        inArray(checks.status, ["delivered", "superseded"]),
      ),
    );
  const receipts = await db.query.documentationGitDeliveries.findMany({
    where: lte(deliveries.receivedAt, cutoff),
    limit: 100,
  });
  if (receipts.length)
    await db.delete(deliveries).where(
      inArray(
        deliveries.deliveryId,
        receipts.map((r) => r.deliveryId),
      ),
    );
  const validationBuckets = await db.query.rateLimitBuckets.findMany({
    where: and(
      like(buckets.key, "docs-validation:%"),
      lte(buckets.resetAt, new Date(now.getTime() - DAY)),
    ),
    limit: 100,
  });
  if (validationBuckets.length)
    await db.delete(buckets).where(
      inArray(
        buckets.key,
        validationBuckets.map((row) => row.key),
      ),
    );
  return {
    credentials,
    plansExpired: expired.length,
    exportsRemoved,
    snapshotsRemoved: snapshots.length,
    reportsRemoved: reports.length,
    checkReportsRemoved: terminalChecks.length,
    receiptsRemoved: receipts.length,
    validationBucketsRemoved: validationBuckets.length,
    proposalsRemoved: closedProposals.length,
  };
}
