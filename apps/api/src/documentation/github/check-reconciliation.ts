import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "../../db/client";
import {
  documentationGitBindings as bindings,
  documentationGitChecks as checks,
} from "../../db/schema";
import { lockSettings } from "../authoring";
import { DocsGitHubApp, GitHubDocsError, getDocsGitHubAppConfig } from "./app";
import { enqueueGitPrCheck } from "./check-worker";
import { readGitBindingAccess } from "./state";
const INTERVAL_MS = 15 * 60_000;

/** Independent of branch imports and their pending leases. Complete provider
 * listing discovers external PRs even after their original webhook/report has
 * been lost or collected. One bounded batch of five sources runs per tick. */
export async function reconcileGitPrChecks(
  injectedApp?: DocsGitHubApp,
  teamId?: string,
) {
  const due = and(
    eq(bindings.status, "connected"),
    // Docs PR checks only; a pages-only connection has none.
    eq(bindings.docsEnabled, true),
    lte(bindings.nextPrReconcileAt, sql`now()`),
    teamId ? eq(bindings.teamId, teamId) : undefined,
  );
  const candidates = await db.query.documentationGitBindings.findMany({
    where: due,
    orderBy: [asc(bindings.nextPrReconcileAt), asc(bindings.teamId)],
    limit: 5,
  });
  let sources = 0,
    queued = 0,
    failures = 0;
  for (const candidate of candidates) {
    const [binding] = await db
      .update(bindings)
      .set({ nextPrReconcileAt: new Date(Date.now() + INTERVAL_MS) })
      .where(
        and(
          eq(bindings.teamId, candidate.teamId),
          eq(bindings.generation, candidate.generation),
          due,
        ),
      )
      .returning();
    if (!binding) continue;
    sources++;
    try {
      if (!binding.capabilities.read)
        throw new GitHubDocsError("GITHUB_SUPERSEDED", 409);
      const app = injectedApp ?? new DocsGitHubApp(getDocsGitHubAppConfig());
      const access = await readGitBindingAccess(binding, app);
      const { token } = await app.installationToken(
        Number(binding.installationId),
        Number(binding.repositoryId),
        "review",
      );
      const open = await app.openPullRequestCandidates(
        token,
        access.repository.owner.login,
        access.repository.name,
        { repositoryId: Number(binding.repositoryId), base: binding.branch },
      );
      const head = await app.branchHead(
        token,
        access.repository.owner.login,
        access.repository.name,
        binding.branch,
      );
      const added = await db.transaction(async (tx) => {
        const settings = await lockSettings(tx, binding.teamId);
        const current = await tx.query.documentationGitBindings.findFirst({
          where: and(
            eq(bindings.teamId, binding.teamId),
            eq(bindings.generation, binding.generation),
          ),
        });
        if (
          settings.source !== "git" ||
          current?.status !== "connected" ||
          !current.capabilities.read
        )
          throw new GitHubDocsError("GITHUB_SUPERSEDED", 409);
        let added = 0;
        for (const pr of open) {
          const active = await tx.query.documentationGitChecks.findFirst({
            where: and(
              eq(checks.teamId, binding.teamId),
              eq(checks.pullRequestNumber, pr.number),
              eq(checks.connectionGeneration, binding.generation),
              inArray(checks.status, ["queued", "validating", "reporting"]),
            ),
          });
          // Do not reset a report's provider backoff or steal a running lease.
          if (active) continue;
          const latest = await tx.query.documentationGitChecks.findFirst({
            where: and(
              eq(checks.teamId, binding.teamId),
              eq(checks.pullRequestNumber, pr.number),
              eq(checks.connectionGeneration, binding.generation),
              eq(checks.status, "delivered"),
            ),
            orderBy: [desc(checks.createdAt), desc(checks.checkId)],
          });
          const result = latest?.result;
          const supportedProof =
            result?.outcome !== "incomplete" ||
            (!pr.supported &&
              result.diagnostics.some((d) => d.code === "GITHUB_FORK_UNSUPPORTED"));
          if (
            result &&
            supportedProof &&
            result.headSha === pr.headSha &&
            result.baseSha === head &&
            result.mergeSha === pr.mergeSha &&
            result.docsDraftVersion === settings.draftVersion &&
            result.policyEpoch === settings.policyEpoch &&
            result.purgeGeneration === settings.purgeGeneration
          )
            continue;
          await enqueueGitPrCheck(binding.teamId, pr.number, tx);
          added++;
        }
        // Read-only recovery for closed/merged PRs uses normal check/review jobs;
        // absence from an open-only list cannot itself prove closure or a merge.
        const unfinished = await tx.query.documentationGitChecks.findMany({
          where: and(
            eq(checks.teamId, binding.teamId),
            eq(checks.connectionGeneration, binding.generation),
            sql`${checks.pullRequestNumber} is not null`,
            inArray(checks.status, ["queued", "validating", "reporting"]),
          ),
          limit: 1001,
        });
        if (unfinished.length > 1000)
          throw new GitHubDocsError("GITHUB_RECONCILIATION_LIMIT", 409);
        await tx
          .update(bindings)
          .set({ lastPrReconcileError: null })
          .where(eq(bindings.teamId, binding.teamId));
        return added;
      });
      queued += added;
    } catch (error) {
      failures++;
      const code = error instanceof GitHubDocsError ? error.code : "GITHUB_UNAVAILABLE";
      await db
        .update(bindings)
        .set({
          lastPrReconcileError: code,
          nextPrReconcileAt: new Date(
            Math.max(
              Date.now() + INTERVAL_MS,
              error instanceof GitHubDocsError ? (error.retryAt?.getTime() ?? 0) : 0,
            ),
          ),
        })
        .where(
          and(
            eq(bindings.teamId, binding.teamId),
            eq(bindings.generation, binding.generation),
            eq(bindings.status, "connected"),
          ),
        );
    }
  }
  return { sources, queued, failures };
}
