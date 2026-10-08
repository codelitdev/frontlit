import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import type { DocsDiagnostic } from "@frontlit/text-editor/docs";
import { db } from "../../db/client";
import {
  documentationGitBindings as bindings,
  documentationGitChecks as checks,
  documentationGitJobs as jobs,
  documentationPublications as publications,
  documentationMemberships as memberships,
  documentationSettings as settingsTable,
} from "../../db/schema";
import { lockSettings } from "../authoring";
import { DocsGitHubApp, GitHubDocsError, getDocsGitHubAppConfig } from "./app";
import type { GitDocsCheckInput } from "./app";
import { deliverGitDocsCheck } from "./check-delivery";
import { withGitCheckLease } from "./check-worker";
import { readGitBindingAccess } from "./state";

export type GitPublicationCheckResult = {
  commitSha: string;
  publicationId: string | null;
  outcome: "published" | "failed" | "superseded";
  publishedCount: number;
  diagnostics: DocsDiagnostic[];
  policyEpoch: number;
  purgeGeneration: number;
};
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Check = typeof checks.$inferSelect;

/** Terminal sync truth is immutable. Reporting has its own durable lease/retry
 * record and must never change publication state or rerun preparation. */
export async function enqueueGitPublicationCheck(
  teamId: string,
  runId: string,
  executor?: Transaction,
) {
  const run = async (tx: Transaction) => {
    const settings = await lockSettings(tx, teamId);
    const binding = await tx.query.documentationGitBindings.findFirst({
      where: eq(bindings.teamId, teamId),
    });
    const sync = await tx.query.documentationGitJobs.findFirst({
      where: and(eq(jobs.teamId, teamId), eq(jobs.runId, runId)),
    });
    if (
      settings.source !== "git" ||
      binding?.status !== "connected" ||
      !binding.capabilities.read ||
      !sync ||
      sync.connectionGeneration !== binding.generation ||
      !["active", "failed", "superseded"].includes(sync.status) ||
      !sync.observedSha ||
      !/^[a-f0-9]{40}$/.test(sync.observedSha)
    )
      throw new GitHubDocsError("GITHUB_SUPERSEDED", 409);
    const existing = await tx.query.documentationGitChecks.findFirst({
      where: and(eq(checks.teamId, teamId), eq(checks.syncRunId, runId)),
    });
    if (existing) return existing;
    const publication = sync.publicationId
      ? await tx.query.documentationPublications.findFirst({
          where: and(
            eq(publications.teamId, teamId),
            eq(publications.publicationId, sync.publicationId),
          ),
        })
      : null;
    if (
      sync.status === "active" &&
      (!publication ||
        !["active", "archived"].includes(publication.status) ||
        publication.purgeGeneration !== settings.purgeGeneration)
    )
      throw new GitHubDocsError("GITHUB_SUPERSEDED", 409);
    const [{ value }] = publication
      ? await tx
          .select({ value: count() })
          .from(memberships)
          .where(eq(memberships.publicationId, publication.publicationId))
      : [{ value: 0 }];
    const diagnostics: DocsDiagnostic[] =
      publication?.diagnostics.length &&
      publication.purgeGeneration === settings.purgeGeneration
        ? (publication.diagnostics as DocsDiagnostic[])
        : sync.diagnosticReport &&
            sync.diagnosticReport.policyEpoch === settings.policyEpoch &&
            sync.diagnosticReport.purgeGeneration === settings.purgeGeneration
          ? sync.diagnosticReport.diagnostics
          : sync.diagnostic
            ? [
                {
                  code: sync.diagnostic,
                  message: sync.diagnostic,
                  severity: "error" as const,
                  blocksSave: false,
                  blocksPublish: true,
                },
              ]
            : [];
    const [check] = await tx
      .insert(checks)
      .values({
        teamId,
        connectionGeneration: binding.generation,
        syncRunId: runId,
        status: "reporting",
        publicationResult: {
          commitSha: sync.observedSha,
          publicationId: sync.publicationId,
          outcome:
            sync.status === "active"
              ? "published"
              : sync.status === "failed"
                ? "failed"
                : "superseded",
          publishedCount: sync.status === "active" ? value : 0,
          diagnostics,
          policyEpoch: settings.policyEpoch,
          purgeGeneration: publication?.purgeGeneration ?? settings.purgeGeneration,
        },
      })
      .returning();
    return check;
  };
  return executor ? run(executor) : db.transaction(run);
}

/** Polling the durable terminal sync rows also recovers a crash between
 * activation/failure and report enqueue. Five reports per tick bounds work. */
export async function reconcileGitPublicationChecks(teamId?: string) {
  const candidates = await db
    .select({ teamId: jobs.teamId, runId: jobs.runId })
    .from(jobs)
    .innerJoin(
      bindings,
      and(
        eq(bindings.teamId, jobs.teamId),
        eq(bindings.generation, jobs.connectionGeneration),
        eq(bindings.status, "connected"),
      ),
    )
    .innerJoin(settingsTable, eq(settingsTable.teamId, jobs.teamId))
    .where(
      and(
        eq(settingsTable.source, "git"),
        sql`${bindings.capabilities}->>'read' = 'true'`,
        inArray(jobs.status, ["active", "failed", "superseded"]),
        sql`${jobs.observedSha} ~ '^[a-f0-9]{40}$'`,
        sql`(${jobs.status} <> 'active' or exists (select 1 from documentation_publications where publication_id = ${jobs.publicationId} and team_id = ${jobs.teamId} and status in ('active', 'archived') and purge_generation = ${settingsTable.purgeGeneration}))`,
        sql`not exists (select 1 from documentation_git_checks where team_id = ${jobs.teamId} and sync_run_id = ${jobs.runId})`,
        // An unchanged reconciliation of an already reported live publication
        // needs no new GitHub mutation. Different commits/publications retain
        // their own immutable outcome even if the docs text is identical.
        sql`(${jobs.trigger} <> 'reconcile' or ${jobs.status} <> 'active' or not exists (
          select 1 from documentation_git_checks where team_id = ${jobs.teamId}
          and connection_generation = ${jobs.connectionGeneration}
          and status in ('queued', 'validating', 'reporting', 'delivered')
          and publication_result->>'outcome' = 'published'
          and publication_result->>'commitSha' = ${jobs.observedSha}
          and publication_result->>'publicationId' = ${jobs.publicationId}
          and (publication_result->>'policyEpoch')::integer = ${settingsTable.policyEpoch}
          and (publication_result->>'purgeGeneration')::integer = ${settingsTable.purgeGeneration}
        ))`,
        teamId ? eq(jobs.teamId, teamId) : undefined,
      ),
    )
    .orderBy(asc(jobs.createdAt))
    .limit(5);
  let queued = 0;
  for (const candidate of candidates) {
    try {
      await enqueueGitPublicationCheck(candidate.teamId, candidate.runId);
      queued++;
    } catch (error) {
      if (!(error instanceof GitHubDocsError) || error.code !== "GITHUB_SUPERSEDED")
        throw error;
    }
  }
  return queued;
}

export async function processGitPublicationCheck(
  job: Check,
  app: DocsGitHubApp,
  webOrigin?: string,
) {
  const result = job.publicationResult;
  if (!result || !job.syncRunId)
    throw new GitHubDocsError("GITHUB_INVALID_REQUEST", 400);
  const binding = await withGitCheckLease(job, async (_tx, _row, binding) => binding);
  const access = await readGitBindingAccess(binding, app);
  const { token } = await app.installationToken(
    Number(binding.installationId),
    Number(binding.repositoryId),
    "checks",
  );
  const guard = async () => {
    await withGitCheckLease(job, async (tx) => {
      const sync = await tx.query.documentationGitJobs.findFirst({
        where: and(eq(jobs.teamId, job.teamId), eq(jobs.runId, job.syncRunId!)),
      });
      const outcome = sync?.status === "active" ? "published" : sync?.status;
      if (
        !sync ||
        sync.connectionGeneration !== job.connectionGeneration ||
        sync.observedSha !== result.commitSha ||
        sync.publicationId !== result.publicationId ||
        outcome !== result.outcome
      )
        throw new GitHubDocsError("GITHUB_SUPERSEDED", 409);
    });
    // Refresh provider installation/repository authority before every mutation.
    await readGitBindingAccess(binding, app);
    await withGitCheckLease(job, async () => {});
  };
  await guard();
  const annotations: NonNullable<GitDocsCheckInput["output"]["annotations"]> =
    result.diagnostics
      .filter((d) => d.file && d.line && d.line > 0)
      .map((d) => ({
        path: d.file!,
        start_line: d.line!,
        end_line: d.line!,
        annotation_level: d.severity === "error" ? "failure" : "warning",
        message: d.code,
      }));
  const remote = await deliverGitDocsCheck(
    app,
    token,
    access.repository.owner.login,
    access.repository.name,
    {
      name: "FrontLit / docs publication",
      headSha: result.commitSha,
      externalId: `frontlit:publication:${job.checkId}`,
      detailsUrl: new URL(
        `/content/documentation/github/checks/${job.checkId}`,
        webOrigin ?? getDocsGitHubAppConfig().webOrigin,
      ).toString(),
      conclusion:
        result.outcome === "published"
          ? "success"
          : result.outcome === "failed"
            ? "failure"
            : "neutral",
      output: {
        title: `Documentation publication: ${result.outcome}`,
        summary: `${result.publishedCount} public docs.\nCommit: ${result.commitSha}\n${[...new Set(result.diagnostics.map((d) => d.code))].slice(0, 100).join(", ")}`,
        annotations,
      },
    },
    guard,
  );
  return withGitCheckLease(job, async (tx) => {
    const [updated] = await tx
      .update(checks)
      .set({
        status: "delivered",
        checkRunId: remote.id,
        lastError: null,
        errorPhase: null,
        finishedAt: new Date(),
        leaseToken: null,
        leaseExpiresAt: null,
      })
      .where(eq(checks.checkId, job.checkId))
      .returning();
    return updated;
  });
}
