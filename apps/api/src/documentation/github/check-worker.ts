import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../../db/client";
import {
  documentationGitChecks as checks,
  documentationGitBindings as bindings,
} from "../../db/schema";
import { lockSettings } from "../authoring";
import {
  DocsGitHubApp,
  GitHubDocsError,
  getDocsGitHubAppConfig,
  type GitDocsCheckInput,
} from "./app";
import { deliverGitDocsCheck } from "./check-delivery";
import { validateGitPullRequest } from "./pr-validation";
import { readGitBindingAccess } from "./state";
import { processGitPublicationCheck } from "./publication-checks";
const ACTIVE = ["queued", "validating", "reporting"] as const;
const LEASE_MS = 120_000;
type Job = typeof checks.$inferSelect;
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Call under the same docs lock as webhook admission. A newer event invalidates
 * the previous lease/result instead of reusing a check for another merge. */
export async function enqueueGitPrCheck(
  teamId: string,
  number: number,
  executor?: Transaction,
) {
  if (!Number.isSafeInteger(number) || number < 1)
    throw new GitHubDocsError("GITHUB_INVALID_REQUEST", 400);
  const run = async (tx: Transaction) => {
    const settings = await lockSettings(tx, teamId);
    const binding = await tx.query.documentationGitBindings.findFirst({
      where: eq(bindings.teamId, teamId),
    });
    if (
      settings.source !== "git" ||
      binding?.status !== "connected" ||
      !binding.capabilities.read
    )
      throw new GitHubDocsError("GITHUB_SUPERSEDED", 409);
    await tx
      .update(checks)
      .set({
        status: "superseded",
        finishedAt: new Date(),
        leaseToken: null,
        leaseExpiresAt: null,
      })
      .where(
        and(
          eq(checks.teamId, teamId),
          eq(checks.pullRequestNumber, number),
          inArray(checks.status, [...ACTIVE]),
        ),
      );
    const [job] = await tx
      .insert(checks)
      .values({
        teamId,
        connectionGeneration: binding.generation,
        pullRequestNumber: number,
      })
      .returning();
    return job;
  };
  return executor ? run(executor) : db.transaction(run);
}
export async function claimGitCheck(teamId?: string) {
  const due = and(
    inArray(checks.status, [...ACTIVE]),
    lte(checks.nextAttemptAt, sql`now()`),
    or(isNull(checks.leaseExpiresAt), lte(checks.leaseExpiresAt, sql`now()`)),
  );
  const candidates = await db.query.documentationGitChecks.findMany({
    where: and(due, teamId ? eq(checks.teamId, teamId) : undefined),
    orderBy: [asc(checks.nextAttemptAt), asc(checks.createdAt)],
    limit: 10,
  });
  for (const candidate of candidates) {
    const [job] = await db
      .update(checks)
      .set({
        status: candidate.status === "reporting" ? "reporting" : "validating",
        attempts: candidate.attempts + 1,
        leaseToken: randomUUID(),
        leaseExpiresAt: new Date(Date.now() + LEASE_MS),
      })
      .where(and(eq(checks.checkId, candidate.checkId), due))
      .returning();
    if (job) return job;
  }
  return null;
}
async function withLease<T>(
  job: Job,
  callback: (
    tx: Transaction,
    row: Job,
    binding: typeof bindings.$inferSelect,
  ) => Promise<T>,
) {
  return db.transaction(async (tx) => {
    const settings = await lockSettings(tx, job.teamId);
    const current = await tx.query.documentationGitChecks.findFirst({
      where: eq(checks.checkId, job.checkId),
    });
    const binding = await tx.query.documentationGitBindings.findFirst({
      where: eq(bindings.teamId, job.teamId),
    });
    if (
      !current ||
      current.leaseToken !== job.leaseToken ||
      !current.leaseExpiresAt ||
      current.leaseExpiresAt <= new Date() ||
      !ACTIVE.includes(current.status as (typeof ACTIVE)[number]) ||
      settings.source !== "git" ||
      binding?.status !== "connected" ||
      !binding.capabilities.read ||
      binding.generation !== job.connectionGeneration
    )
      throw new GitHubDocsError("GITHUB_SUPERSEDED", 409);
    if (
      current.publicationResult &&
      (current.publicationResult.policyEpoch !== settings.policyEpoch ||
        current.publicationResult.purgeGeneration !== settings.purgeGeneration)
    )
      throw new GitHubDocsError("GITHUB_SUPERSEDED", 409);
    if (
      current.result &&
      (current.result.docsDraftVersion !== settings.draftVersion ||
        current.result.policyEpoch !== settings.policyEpoch ||
        current.result.purgeGeneration !== settings.purgeGeneration)
    )
      throw new GitHubDocsError("GITHUB_PR_CHANGED", 409);
    await tx
      .update(checks)
      .set({ leaseExpiresAt: new Date(Date.now() + LEASE_MS) })
      .where(eq(checks.checkId, current.checkId));
    return callback(tx, current, binding);
  });
}
export { withLease as withGitCheckLease };
export async function processGitCheck(
  teamId?: string,
  injectedApp?: DocsGitHubApp,
  webOrigin?: string,
) {
  let job = await claimGitCheck(teamId);
  if (!job) return null;
  let phase: "validation" | "delivery" =
    job.status === "reporting" ? "delivery" : "validation";
  try {
    const app = injectedApp ?? new DocsGitHubApp(getDocsGitHubAppConfig());
    if (job.syncRunId) {
      phase = "delivery";
      return await processGitPublicationCheck(job, app, webOrigin);
    }
    if (job.pullRequestNumber === null)
      throw new GitHubDocsError("GITHUB_INVALID_REQUEST", 400);
    const binding = await withLease(job, async (_tx, _row, binding) => binding);
    if (phase === "validation") {
      const result = await validateGitPullRequest(
        binding,
        job.pullRequestNumber,
        app,
        async () => {
          await withLease(job!, async () => {});
        },
      );
      if (result.diagnostics.some((d) => d.code === "GITHUB_PR_MERGE_PENDING"))
        throw new GitHubDocsError("GITHUB_PR_MERGE_PENDING");
      job = await withLease(job, async (tx, row) => {
        const [updated] = await tx
          .update(checks)
          .set({ result, status: "reporting", lastError: null, errorPhase: null })
          .where(eq(checks.checkId, row.checkId))
          .returning();
        return updated;
      });
    }
    phase = "delivery";
    const result = job.result!;
    const access = await readGitBindingAccess(binding, app);
    const { token } = await app.installationToken(
      Number(binding.installationId),
      Number(binding.repositoryId),
      "checks",
    );
    const guard = async () => {
      await withLease(job!, async () => {});
      const { token: readToken } = await app.installationToken(
        Number(binding.installationId),
        Number(binding.repositoryId),
        "review",
      );
      const pr = await app.pullRequestCandidate(
        readToken,
        access.repository.owner.login,
        access.repository.name,
        {
          number: job!.pullRequestNumber!,
          repositoryId: Number(binding.repositoryId),
          base: binding.branch,
        },
      );
      const base = await app.branchHead(
        readToken,
        access.repository.owner.login,
        access.repository.name,
        binding.branch,
      );
      const closedResult = result.diagnostics.some(
        (d) => d.code === "GITHUB_PR_CLOSED",
      );
      const closedNow = pr.state === "closed" || pr.merged;
      if (
        closedResult !== closedNow ||
        pr.headSha !== result.headSha ||
        pr.mergeSha !== result.mergeSha ||
        (!closedResult && base !== result.baseSha)
      )
        throw new GitHubDocsError("GITHUB_PR_CHANGED", 409);
      await withLease(job!, async () => {});
    };
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
    const details = new URL(
      `/content/documentation/github/checks/${job.checkId}`,
      webOrigin ?? getDocsGitHubAppConfig().webOrigin,
    );
    // Codes and counts are sufficient in GitHub; detailed private diagnostics
    // stay in FrontLit, under current read and media-access checks.
    const input: GitDocsCheckInput & { conclusion: "success" | "failure" | "neutral" } =
      {
        headSha: result.headSha,
        name: "FrontLit / docs validation",
        externalId: `frontlit:validation:${job.checkId}`,
        detailsUrl: details.toString(),
        conclusion:
          result.outcome === "valid"
            ? "success"
            : result.outcome === "invalid"
              ? "failure"
              : "neutral",
        output: {
          title: `Documentation validation: ${result.outcome}`,
          summary: `${result.fileCount} managed files; ${result.publishedCount} public docs.\nHead: ${result.headSha}\nBase: ${result.baseSha}\n${[...new Set(result.diagnostics.map((d) => d.code))].slice(0, 100).join(", ")}`,
          annotations,
        },
      };
    // Even a response-lost completed report needs fresh local/source authority.
    await guard();
    const remote = await deliverGitDocsCheck(
      app,
      token,
      access.repository.owner.login,
      access.repository.name,
      input,
      guard,
    );
    return await withLease(job, async (tx, row) => {
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
        .where(eq(checks.checkId, row.checkId))
        .returning();
      return updated;
    });
  } catch (error) {
    const code = error instanceof GitHubDocsError ? error.code : "GITHUB_UNAVAILABLE";
    return db.transaction(async (tx) => {
      await lockSettings(tx, job!.teamId);
      const current = await tx.query.documentationGitChecks.findFirst({
        where: eq(checks.checkId, job!.checkId),
      });
      if (
        current?.leaseToken !== job!.leaseToken ||
        !current?.leaseExpiresAt ||
        current.leaseExpiresAt <= new Date() ||
        !ACTIVE.includes(current.status as (typeof ACTIVE)[number])
      )
        return current;
      const superseded = [
        "GITHUB_SUPERSEDED",
        "GITHUB_PR_CHANGED",
        "GITHUB_PR_TARGET_CHANGED",
      ].includes(code);
      const [updated] = await tx
        .update(checks)
        .set({
          status: superseded
            ? "superseded"
            : phase === "delivery"
              ? "reporting"
              : "queued",
          lastError: code,
          errorPhase: phase,
          finishedAt: superseded ? new Date() : null,
          leaseToken: null,
          leaseExpiresAt: null,
          nextAttemptAt: new Date(
            Math.max(
              Date.now() + 60_000,
              error instanceof GitHubDocsError ? (error.retryAt?.getTime() ?? 0) : 0,
            ),
          ),
        })
        .where(eq(checks.checkId, current.checkId))
        .returning();
      // Refresh a captured result that changed during delivery. A provider's
      // persistently stale synthetic merge can fail validation before capture;
      // let webhooks/periodic discovery retry that instead of spawning a new
      // check every minute forever.
      if (
        code === "GITHUB_PR_CHANGED" &&
        phase === "delivery" &&
        current.pullRequestNumber !== null
      ) {
        const fresh = await enqueueGitPrCheck(
          current.teamId,
          current.pullRequestNumber,
          tx,
        );
        await tx
          .update(checks)
          .set({ nextAttemptAt: updated.nextAttemptAt })
          .where(eq(checks.checkId, fresh.checkId));
      }
      return updated;
    });
  }
}
