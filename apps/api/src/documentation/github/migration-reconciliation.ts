import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../../db/client";
import {
  documentationGitMigrationPrs as requests,
  documentationGitMigrations as plans,
} from "../../db/schema";
import { lockSettings } from "../authoring";
import { assertGitPublisherCredential } from "./publisher";
import { DocsGitHubApp, GitHubDocsError, getDocsGitHubAppConfig } from "./app";

/** Poll only PR identity/status, never remote prose or document bodies. Setup
 * expiry fences new writes; it need not hide a previously created PR's outcome.
 * Verification and activation still require fresh account-bound setup proof. */
export async function reconcileGitMigrationPr(
  teamId?: string,
  injectedApp?: DocsGitHubApp,
) {
  if (process.env.DOCS_RESTORE_PENDING === "true") return null;
  const due = and(
    eq(requests.status, "open"),
    lte(requests.nextAttemptAt, sql`now()`),
    or(isNull(requests.leaseExpiresAt), lte(requests.leaseExpiresAt, sql`now()`)),
  );
  const candidates = await db.query.documentationGitMigrationPrs.findMany({
    where: and(due, teamId ? eq(requests.teamId, teamId) : undefined),
    orderBy: [asc(requests.nextAttemptAt), asc(requests.createdAt)],
    limit: 10,
  });
  let claimed: typeof requests.$inferSelect | undefined;
  for (const candidate of candidates) {
    [claimed] = await db
      .update(requests)
      .set({
        leaseToken: randomUUID(),
        leaseExpiresAt: new Date(Date.now() + 120000),
        nextAttemptAt: new Date(Date.now() + 60000),
      })
      .where(and(eq(requests.planId, candidate.planId), due))
      .returning();
    if (claimed) break;
  }
  if (!claimed) return null;
  const request = claimed;
  async function authority() {
    return db.transaction(async (tx) => {
      if (process.env.DOCS_RESTORE_PENDING === "true")
        throw new GitHubDocsError("RESTORE_PENDING", 409);
      const settings = await lockSettings(tx, request.teamId);
      const current = await tx.query.documentationGitMigrationPrs.findFirst({
        where: eq(requests.planId, request.planId),
      });
      if (
        !current ||
        current.status !== "open" ||
        current.leaseToken !== request.leaseToken ||
        !current.leaseExpiresAt ||
        current.leaseExpiresAt <= new Date()
      )
        throw new GitHubDocsError("GITHUB_SUPERSEDED", 409);
      await assertGitPublisherCredential(request.teamId, current.actorCredential, tx, [
        "documentation:manage",
        "documentation:publish",
      ]);
      if (
        settings.policyEpoch !== current.policyEpoch ||
        settings.purgeGeneration !== current.purgeGeneration
      )
        throw new GitHubDocsError("MIGRATION_STALE", 409);
      const plan = await tx.query.documentationGitMigrations.findFirst({
        where: and(eq(plans.planId, request.planId), eq(plans.teamId, request.teamId)),
      });
      if (!plan || !current.pullRequestNumber || !current.commitSha)
        throw new GitHubDocsError("GITHUB_PROPOSAL_RECOVERY_CONFLICT", 409);
      return { current, plan };
    });
  }
  try {
    const { plan } = await authority();
    const app = injectedApp ?? new DocsGitHubApp(getDocsGitHubAppConfig());
    const installation = await app.installation(plan.selection.installationId);
    if (
      installation.id !== plan.selection.installationId ||
      installation.suspended_at ||
      !["read", "write"].includes(installation.permissions.contents)
    )
      throw new GitHubDocsError("GITHUB_ACCESS_LOST", 403);
    const { token } = await app.installationToken(
      plan.selection.installationId,
      plan.selection.repositoryId,
      "review",
    );
    // Repository identity by ID avoids trusting any stored/display name.
    const repository = await app.repositoryById(token, plan.selection.repositoryId);
    if (String(repository.owner.id) !== request.ownerId)
      throw new GitHubDocsError("GITHUB_OWNER_CHANGED", 403);
    const pr = await app.findMigrationPullRequest(
      token,
      repository.owner.login,
      repository.name,
      {
        planId: plan.planId,
        base: plan.selection.branch,
        repositoryId: plan.selection.repositoryId,
      },
    );
    if (
      !pr ||
      pr.number !== request.pullRequestNumber ||
      pr.headSha !== request.commitSha
    )
      throw new GitHubDocsError("GITHUB_PROPOSAL_RECOVERY_CONFLICT", 409);
    await authority();
    const [updated] = await db
      .update(requests)
      .set({
        status: pr.merged ? "merged" : pr.state,
        mergedCommitSha: pr.mergeCommitSha,
        diagnostic: null,
        leaseToken: null,
        leaseExpiresAt: null,
        finishedAt: pr.state === "closed" ? new Date() : null,
      })
      .where(
        and(
          eq(requests.planId, request.planId),
          eq(requests.status, "open"),
          eq(requests.leaseToken, request.leaseToken!),
        ),
      )
      .returning();
    return updated ?? null;
  } catch (error) {
    const code = error instanceof GitHubDocsError ? error.code : "GITHUB_UNAVAILABLE";
    const [updated] = await db
      .update(requests)
      .set({
        diagnostic: code,
        leaseToken: null,
        leaseExpiresAt: null,
        nextAttemptAt: new Date(
          Math.max(
            Date.now() + 60000,
            error instanceof GitHubDocsError ? (error.retryAt?.getTime() ?? 0) : 0,
          ),
        ),
      })
      .where(
        and(
          eq(requests.planId, request.planId),
          eq(requests.status, "open"),
          eq(requests.leaseToken, request.leaseToken!),
        ),
      )
      .returning();
    return updated ?? null;
  }
}
