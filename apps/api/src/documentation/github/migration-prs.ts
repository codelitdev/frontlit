import { and, eq } from "drizzle-orm";
import {
  documentationGitMigrationPrBodySchema,
  documentationGitMigrationPrSchema,
} from "@frontlit/api-contract";
import type { AuthzContext } from "../../auth/authorize";
import { db } from "../../db/client";
import {
  documentationGitMigrationPrs as requests,
  documentationGitPreflights as preflights,
} from "../../db/schema";
import { lockSettings } from "../authoring";
import { digest, documentationReadAllowed } from "../publications";
import { serializeDates } from "../../utils/public";
import { DocsGitHubApp, getDocsGitHubAppConfig, GitHubDocsError } from "./app";
import { ownedPlan, currentPlan } from "./migrations";
import { authorizedSetup, requireGitManager, verifySetupRepository } from "./setup";
import { assertGitPublisherCredential, type GitPublisherCredential } from "./publisher";

export function migrationPrSummary(row: typeof requests.$inferSelect) {
  return documentationGitMigrationPrSchema.parse(
    serializeDates({
      planId: row.planId,
      status: row.status,
      branch: row.branch,
      commitSha: row.commitSha,
      bootstrapSha: row.bootstrapSha,
      pullRequestNumber: row.pullRequestNumber,
      pullRequestUrl: row.pullRequestUrl,
      mergedCommitSha: row.mergedCommitSha,
      diagnostic: row.diagnostic,
      createdAt: row.createdAt,
      finishedAt: row.finishedAt,
    }),
  );
}

/** Admission is private DB work, not a remote write. The scheduler will consume
 * this immutable plan reference with fresh authority checks at each mutation. */
export async function submitGitMigrationPr(
  teamId: string,
  actor: AuthzContext,
  credential: GitPublisherCredential,
  planId: string,
  raw: unknown,
  config = getDocsGitHubAppConfig(),
  app = new DocsGitHubApp(config),
) {
  requireGitManager(teamId, actor, false, true);
  if (process.env.DOCS_RESTORE_PENDING === "true")
    throw new GitHubDocsError("RESTORE_PENDING", 409);
  const parsed = documentationGitMigrationPrBodySchema.safeParse(raw);
  if (!parsed.success) throw new GitHubDocsError("INVALID_REQUEST", 400);
  const input = parsed.data;
  if (credential.kind === "apikey" || credential.accountId !== actor.accountId)
    throw new GitHubDocsError("GITHUB_USER_AUTH_REQUIRED", 403);
  const plan = await ownedPlan(teamId, planId, actor);
  if (
    input.planHash !== plan.planHash ||
    input.expectedDocsDraftVersion !== plan.docsDraftVersion ||
    input.expectedPublicationId !== plan.activePublicationId
  )
    throw new GitHubDocsError("MIGRATION_STALE", 409);
  const inputHash = digest({ planId, ...input, setupId: undefined });
  const existing = await db.query.documentationGitMigrationPrs.findFirst({
    where: and(eq(requests.teamId, teamId), eq(requests.planId, planId)),
  });
  if (existing) {
    await assertGitPublisherCredential(teamId, credential, db, [
      "documentation:manage",
      "documentation:publish",
    ]);
    if (
      existing.idempotencyKey !== input.idempotencyKey ||
      existing.inputHash !== inputHash
    )
      throw new GitHubDocsError("IDEMPOTENCY_CONFLICT", 409);
    // Terminal artifacts are retained. A canceled/closed plan must never be
    // silently resubmitted by an idempotent click.
    if (["canceled", "closed", "merged"].includes(existing.status))
      return migrationPrSummary(existing);
  }
  const access = await verifySetupRepository(
    teamId,
    input.setupId,
    actor,
    plan.selection,
    config,
    app,
  );
  const installation = await app.installation(plan.selection.installationId);
  if (
    installation.permissions.contents !== "write" ||
    installation.permissions.pull_requests !== "write"
  )
    throw new GitHubDocsError("GITHUB_WRITE_PERMISSION_REQUIRED", 403);
  const row = await db.transaction(async (tx) => {
    await lockSettings(tx, teamId);
    if (process.env.DOCS_RESTORE_PENDING === "true")
      throw new GitHubDocsError("RESTORE_PENDING", 409);
    const current = await ownedPlan(teamId, planId, actor, tx);
    const { settings, docs } = await currentPlan(tx, current);
    await authorizedSetup(teamId, input.setupId, actor, tx);
    await assertGitPublisherCredential(teamId, credential, tx, [
      "documentation:manage",
      "documentation:publish",
    ]);
    const preflight = current.preflightId
      ? await tx.query.documentationGitPreflights.findFirst({
          where: eq(preflights.preflightId, current.preflightId),
        })
      : null;
    if (!preflight || preflight.ownerId !== String(access.repository.owner.id))
      throw new GitHubDocsError("GITHUB_REPOSITORY_NOT_AUTHORIZED", 403);
    if ((preflight.commitSha === null) !== input.initializeEmptyRepository)
      throw new GitHubDocsError(
        "GITHUB_REPOSITORY_INITIALIZATION_CONSENT_REQUIRED",
        409,
      );
    for (const doc of docs)
      if (!(await documentationReadAllowed(teamId, doc, false, tx)))
        throw new GitHubDocsError("GITHUB_PROPOSAL_UNAVAILABLE", 409);
    const same = await tx.query.documentationGitMigrationPrs.findFirst({
      where: and(eq(requests.teamId, teamId), eq(requests.planId, planId)),
    });
    if (same) {
      if (same.idempotencyKey !== input.idempotencyKey || same.inputHash !== inputHash)
        throw new GitHubDocsError("IDEMPOTENCY_CONFLICT", 409);
      if (["canceled", "closed", "merged"].includes(same.status)) return same;
      const renewing =
        same.setupId !== input.setupId ||
        digest(same.actorCredential) !== digest(credential);
      // Do not swap authority beneath a live remote mutation. The lease must
      // finish or expire before a caller can renew that attempt's authority.
      if (same.status === "writing" && renewing)
        throw new GitHubDocsError("GITHUB_WRITE_IN_PROGRESS", 409);
      if (!renewing && same.status !== "failed") return same;
      const [renewed] = await tx
        .update(requests)
        .set({
          setupId: input.setupId,
          actorCredential: credential,
          ...(same.status === "failed"
            ? {
                status: "queued" as const,
                diagnostic: null,
                finishedAt: null,
                nextAttemptAt: new Date(),
                leaseToken: null,
                leaseExpiresAt: null,
              }
            : {}),
        })
        .where(eq(requests.planId, planId))
        .returning();
      return renewed;
    }
    const collision = await tx.query.documentationGitMigrationPrs.findFirst({
      where: and(
        eq(requests.teamId, teamId),
        eq(requests.idempotencyKey, input.idempotencyKey),
      ),
    });
    if (collision) throw new GitHubDocsError("IDEMPOTENCY_CONFLICT", 409);
    const [created] = await tx
      .insert(requests)
      .values({
        planId,
        teamId,
        setupId: input.setupId,
        actorCredential: credential,
        idempotencyKey: input.idempotencyKey,
        inputHash,
        policyEpoch: settings.policyEpoch,
        purgeGeneration: settings.purgeGeneration,
        initializeEmptyRepository: input.initializeEmptyRepository,
        ownerId: preflight.ownerId,
        branch: `frontlit/docs-setup/${planId}`,
      })
      .returning();
    return created;
  });
  return migrationPrSummary(row);
}
