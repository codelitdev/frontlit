import { and, eq } from "drizzle-orm";
import {
  computeEffectivePermissions,
  documentationGitCapabilitiesBodySchema,
} from "@frontlit/api-contract";
import type { AuthzContext } from "../../auth/authorize";
import { db } from "../../db/client";
import {
  documentationGitBindings as bindings,
  documentationGitGrants as grants,
  documentationGitSetups as setups,
  teams,
  teamMembers,
} from "../../db/schema";
import { serializeDates } from "../../utils/public";
import { lockSettings } from "../authoring";
import { digest } from "../publications";
import { DocsGitHubApp, getDocsGitHubAppConfig, GitHubDocsError } from "./app";
import { authorizedSetup, requireGitManager, verifySetupRepository } from "./setup";
import { enqueueGitSync, supersedeGitWork, type GitBinding } from "./state";

export function grantProjection(row: typeof grants.$inferSelect) {
  const { grantId, grantVersion, connectionGeneration, capabilities, grantedAt } = row;
  return serializeDates({
    grantId,
    grantVersion,
    connectionGeneration,
    capabilities,
    grantedAt,
  });
}
function currentBinding(
  binding: GitBinding | undefined,
  input: { expectedConnectionGeneration: number; expectedGrantVersion: number },
) {
  if (
    !binding ||
    !["connected", "paused"].includes(binding.status) ||
    !binding.capabilities.read
  )
    throw new GitHubDocsError("SOURCE_REQUIRES_GIT", 409);
  if (
    binding.generation !== input.expectedConnectionGeneration ||
    binding.grantVersion !== input.expectedGrantVersion
  )
    throw new GitHubDocsError("GITHUB_GRANT_STALE", 409);
  return binding;
}
async function requireCurrentManager(tx: any, teamId: string, actor: AuthzContext) {
  const team = await tx.query.teams.findFirst({ where: eq(teams.id, teamId) });
  const membership = await tx.query.teamMembers.findFirst({
    where: and(
      eq(teamMembers.teamId, teamId),
      eq(teamMembers.accountId, actor.accountId!),
    ),
  });
  const isOwner = team?.ownerAccountId === actor.accountId;
  requireGitManager(
    teamId,
    {
      ...actor,
      isOwner,
      permissions: computeEffectivePermissions(membership?.permissions ?? [], {
        isOwner,
      }),
    },
    true,
    true,
  );
}
/** Installation permission approval is only a prerequisite. This interactive,
 * original-account confirmation establishes this workspace's independent grant. */
export async function changeGitHubCapabilities(
  teamId: string,
  actor: AuthzContext,
  raw: unknown,
  config = getDocsGitHubAppConfig(),
  app = new DocsGitHubApp(config),
) {
  requireGitManager(teamId, actor, true, true);
  await requireCurrentManager(db, teamId, actor);
  const input = documentationGitCapabilitiesBodySchema.parse(raw),
    inputHash = digest(input);
  async function replay(tx: any) {
    const old = await tx.query.documentationGitGrants.findFirst({
      where: and(
        eq(grants.teamId, teamId),
        eq(grants.idempotencyKey, input.idempotencyKey),
      ),
    });
    if (!old) return null;
    if (old.inputHash !== inputHash || old.actorAccountId !== actor.accountId)
      throw new GitHubDocsError("IDEMPOTENCY_CONFLICT", 409);
    return grantProjection(old);
  }
  const repeated = await replay(db);
  if (repeated) return repeated;
  const before = currentBinding(
    await db.query.documentationGitBindings.findFirst({
      where: eq(bindings.teamId, teamId),
    }),
    input,
  );
  const access = await verifySetupRepository(
    teamId,
    input.setupId,
    actor,
    {
      installationId: Number(before.installationId),
      repositoryId: Number(before.repositoryId),
    },
    config,
    app,
  );
  if (access.setup.purpose !== "upgrade")
    throw new GitHubDocsError("GITHUB_UPGRADE_REQUIRED", 409);
  if (String(access.repository.owner.id) !== before.ownerId)
    throw new GitHubDocsError("GITHUB_OWNER_CHANGED", 403);
  const capabilities = {
    read: true,
    proposals: input.consent.delegatePullRequests,
    directCommit: input.consent.delegateDirectCommits,
  };
  const installation = await app.installation(Number(before.installationId));
  if (
    installation.id !== Number(before.installationId) ||
    String(installation.app_id) !== config.appId ||
    installation.suspended_at
  )
    throw new GitHubDocsError("GITHUB_ACCESS_LOST", 403);
  if (
    (capabilities.proposals || capabilities.directCommit) &&
    (installation.permissions.contents !== "write" ||
      installation.permissions.checks !== "write" ||
      (capabilities.proposals && installation.permissions.pull_requests !== "write"))
  )
    throw new GitHubDocsError("GITHUB_WRITE_PERMISSION_REQUIRED", 409);
  return db.transaction(async (tx) => {
    const settings = await lockSettings(tx, teamId);
    await requireCurrentManager(tx, teamId, actor);
    const retry = await replay(tx);
    if (retry) return retry;
    const binding = currentBinding(
      await tx.query.documentationGitBindings.findFirst({
        where: eq(bindings.teamId, teamId),
      }),
      input,
    );
    if (
      // A pages-only connection keeps docs in the editor.
      (binding.docsEnabled && settings.source !== "git") ||
      binding.repositoryId !== before.repositoryId ||
      binding.ownerId !== before.ownerId ||
      binding.installationId !== before.installationId ||
      binding.branch !== before.branch ||
      binding.directory !== before.directory
    )
      throw new GitHubDocsError("GITHUB_GRANT_STALE", 409);
    const setup = await authorizedSetup(teamId, input.setupId, actor, tx);
    if (setup.purpose !== "upgrade" || setup.githubUserId !== access.setup.githubUserId)
      throw new GitHubDocsError("GITHUB_UPGRADE_REQUIRED", 409);
    const grantVersion = binding.grantVersion + 1,
      generation = binding.generation + 1,
      grantedAt = new Date();
    await supersedeGitWork(tx, teamId);
    await tx
      .update(bindings)
      .set({
        capabilities,
        grantVersion,
        generation,
        grantActorAccountId: actor.accountId!,
        grantGithubUserId: setup.githubUserId!,
        repositoryAdminVerified: true,
        grantedAt,
        updatedAt: grantedAt,
      })
      .where(eq(bindings.teamId, teamId));
    const [receipt] = await tx
      .insert(grants)
      .values({
        teamId,
        idempotencyKey: input.idempotencyKey,
        inputHash,
        actorAccountId: actor.accountId!,
        githubUserId: setup.githubUserId!,
        installationId: binding.installationId,
        repositoryId: binding.repositoryId,
        ownerId: binding.ownerId,
        branch: binding.branch,
        directory: binding.directory,
        grantVersion,
        connectionGeneration: generation,
        capabilities,
        repositoryAdminVerified: true,
        grantedAt,
      })
      .returning();
    await tx
      .update(setups)
      .set({ status: "consumed", encryptedUserToken: null, encryptedVerifier: null })
      .where(eq(setups.setupId, setup.setupId));
    // A pages-only connection without a pages folder has nothing to sync.
    if (
      binding.status === "connected" &&
      (binding.docsEnabled || binding.pagesDirectory)
    )
      await enqueueGitSync(teamId, { trigger: "configuration" }, tx);
    return grantProjection(receipt);
  });
}
