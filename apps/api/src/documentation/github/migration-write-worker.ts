import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { splitDocsFrontmatter } from "@frontlit/text-editor/docs";
import type { AuthzContext } from "../../auth/authorize";
import { db } from "../../db/client";
import {
  documentationGitMigrationPrs as requests,
  documentationGitPreflights as preflights,
} from "../../db/schema";
import { lockSettings } from "../authoring";
import {
  DocsGitHubApp,
  GitHubDocsError,
  getDocsGitHubAppConfig,
  type GitHubAppConfig,
} from "./app";
import { currentPlan, ownedPlan } from "./migrations";
import { assertGitPublisherCredential } from "./publisher";
import { authorizedSetup, verifySetupRepository } from "./setup";

type Request = typeof requests.$inferSelect;
const LEASE_MS = 120_000;
const conflict = (): never => {
  throw new GitHubDocsError("GITHUB_PROPOSAL_RECOVERY_CONFLICT", 409);
};

export async function claimGitMigrationWrite(teamId?: string) {
  if (process.env.DOCS_RESTORE_PENDING === "true") return null;
  const due = and(
    inArray(requests.status, ["queued", "writing"]),
    lte(requests.nextAttemptAt, sql`now()`),
    or(isNull(requests.leaseExpiresAt), lte(requests.leaseExpiresAt, sql`now()`)),
  );
  const candidates = await db.query.documentationGitMigrationPrs.findMany({
    where: and(due, teamId ? eq(requests.teamId, teamId) : undefined),
    orderBy: [asc(requests.nextAttemptAt), asc(requests.createdAt)],
    limit: 10,
  });
  for (const candidate of candidates) {
    const [claimed] = await db
      .update(requests)
      .set({
        status: "writing",
        leaseToken: randomUUID(),
        leaseExpiresAt: new Date(Date.now() + LEASE_MS),
        attempts: sql`${requests.attempts} + 1`,
      })
      .where(and(eq(requests.planId, candidate.planId), due))
      .returning();
    if (claimed) return claimed;
  }
  return null;
}

/** Writes consume the immutable editor capture. No source binding or publication
 * is changed here. */
export async function writeGitMigration(
  request: Request,
  app: DocsGitHubApp,
  config: GitHubAppConfig,
) {
  if (request.actorCredential.kind === "apikey" || !request.leaseToken)
    throw new GitHubDocsError("GITHUB_SUPERSEDED", 409);
  const leaseToken = request.leaseToken;
  // This context is reconstructed only to call account-bound setup helpers.
  // Actual current permissions/session/OAuth scopes are checked below in DB.
  const actor: AuthzContext = {
    teamId: request.teamId,
    accountId: request.actorCredential.accountId,
    authKind: request.actorCredential.kind,
    isOwner: false,
    permissions: ["documentation:manage", "documentation:publish"],
    scopes: ["documentation:manage", "documentation:publish"],
    audiences: [],
  };
  async function localAuthority() {
    return db.transaction(async (tx) => {
      if (process.env.DOCS_RESTORE_PENDING === "true")
        throw new GitHubDocsError("RESTORE_PENDING", 409);
      await lockSettings(tx, request.teamId);
      const current = await tx.query.documentationGitMigrationPrs.findFirst({
        where: and(
          eq(requests.planId, request.planId),
          eq(requests.teamId, request.teamId),
        ),
      });
      if (
        !current ||
        current.status !== "writing" ||
        current.leaseToken !== leaseToken ||
        !current.leaseExpiresAt ||
        current.leaseExpiresAt <= new Date()
      )
        throw new GitHubDocsError("GITHUB_SUPERSEDED", 409);
      await assertGitPublisherCredential(request.teamId, current.actorCredential, tx, [
        "documentation:manage",
        "documentation:publish",
      ]);
      const plan = await ownedPlan(request.teamId, request.planId, actor, tx);
      const { settings, docs } = await currentPlan(tx, plan);
      if (
        settings.policyEpoch !== current.policyEpoch ||
        settings.purgeGeneration !== current.purgeGeneration
      )
        throw new GitHubDocsError("MIGRATION_STALE", 409);
      await authorizedSetup(request.teamId, current.setupId, actor, tx);
      await tx
        .update(requests)
        .set({ leaseExpiresAt: new Date(Date.now() + LEASE_MS) })
        .where(
          and(eq(requests.planId, request.planId), eq(requests.leaseToken, leaseToken)),
        );
      return { current, plan };
    });
  }
  async function remoteAuthority() {
    const context = await localAuthority();
    const access = await verifySetupRepository(
      request.teamId,
      context.current.setupId,
      actor,
      context.plan.selection,
      config,
      app,
    );
    if (String(access.repository.owner.id) !== context.current.ownerId) conflict();
    const installation = await app.installation(context.plan.selection.installationId);
    if (
      installation.permissions.contents !== "write" ||
      installation.permissions.pull_requests !== "write"
    )
      throw new GitHubDocsError("GITHUB_WRITE_PERMISSION_REQUIRED", 403);
    await localAuthority(); // Fence cancellation/revocation during provider reads.
    return { ...context, access };
  }
  const guard = async () => {
    await remoteAuthority();
  };
  const context = await remoteAuthority();
  let current = context.current;
  const { plan, access } = context;
  const owner = access.repository.owner.login,
    name = access.repository.name;
  const { token } = await app.installationToken(
    plan.selection.installationId,
    plan.selection.repositoryId,
    "proposal",
  );
  /** Record accepted remote artifacts even if cancellation occurred in flight.
   * This never restores authority or changes a canceled request back to writing. */
  async function record(
    patch: Partial<
      Pick<
        Request,
        | "baseSha"
        | "treeSha"
        | "commitSha"
        | "bootstrapSha"
        | "pullRequestNumber"
        | "pullRequestUrl"
      >
    >,
  ) {
    current = await db.transaction(async (tx) => {
      await lockSettings(tx, request.teamId);
      const row = await tx.query.documentationGitMigrationPrs.findFirst({
        where: eq(requests.planId, request.planId),
      });
      if (!row) throw new GitHubDocsError("GITHUB_SUPERSEDED", 409);
      for (const key of Object.keys(patch) as (keyof typeof patch)[])
        if (row[key] !== null && row[key] !== patch[key]) conflict();
      const [updated] = await tx
        .update(requests)
        .set(patch)
        .where(eq(requests.planId, request.planId))
        .returning();
      return updated;
    });
  }
  if (!current.baseSha) {
    let baseSha: string;
    if (current.initializeEmptyRepository) {
      const preflight = plan.preflightId
        ? await db.query.documentationGitPreflights.findFirst({
            where: eq(preflights.preflightId, plan.preflightId),
          })
        : null;
      if (!preflight || preflight.commitSha !== null) conflict();
      let existing: string | null = null;
      try {
        existing = await app.branchHead(token, owner, name, plan.selection.branch);
      } catch (error) {
        if (
          !(error instanceof GitHubDocsError) ||
          ![404, 409].includes(error.status ?? 0)
        )
          throw error;
      }
      if (existing) {
        // Discover a response-lost initialization, but never adopt somebody
        // else's initial commit or reuse a modified publishing branch.
        const commit = await app.commit(token, owner, name, existing);
        const entries = await app.tree(token, owner, name, commit.tree.sha);
        const blobs = entries.filter((entry) => entry.type !== "tree");
        if (
          commit.message !==
            `Initialize FrontLit documentation directory\n\nFrontLit setup: ${plan.planId}` ||
          commit.parents?.length !== 0 ||
          blobs.length !== 1 ||
          blobs[0].path !== `${plan.selection.directory}/.gitkeep` ||
          blobs[0].mode !== "100644" ||
          (await app.blob(token, owner, name, blobs[0].sha)).toString("utf8") !==
            "FrontLit documentation directory.\n"
        )
          conflict();
        baseSha = existing;
      } else {
        baseSha = await app.initializeDocsRepository(
          token,
          owner,
          name,
          {
            planId: plan.planId,
            branch: plan.selection.branch,
            directory: plan.selection.directory,
          },
          guard,
        );
      }
      await record({ bootstrapSha: baseSha });
    } else baseSha = await app.branchHead(token, owner, name, plan.selection.branch);
    await localAuthority();
    await record({ baseSha });
  }
  const baseCommit = await app.commit(token, owner, name, current.baseSha!);
  const entries = await app.tree(token, owner, name, baseCommit.tree.sha);
  // Never replace an existing managed docs set. A placeholder is harmless, but
  // symlink directories and arbitrary files inside the target are conflicts.
  for (const entry of entries) {
    if (
      (entry.path === plan.selection.directory ||
        plan.selection.directory.startsWith(`${entry.path}/`)) &&
      (entry.type !== "tree" || entry.mode !== "040000")
    )
      conflict();
    if (
      entry.path.startsWith(`${plan.selection.directory}/`) &&
      entry.type !== "tree" &&
      !(
        entry.path === `${plan.selection.directory}/.gitkeep` &&
        entry.type === "blob" &&
        entry.mode === "100644"
      )
    )
      conflict();
  }
  if (!current.treeSha) {
    const treeSha = await app.createMigrationTree(
      token,
      owner,
      name,
      {
        baseTreeSha: baseCommit.tree.sha,
        directory: plan.selection.directory,
        files: plan.files.map((file) => ({ path: file.path, content: file.markdown })),
      },
      guard,
    );
    await record({ treeSha });
    await localAuthority();
  }
  if (!current.commitSha) {
    const commitSha = await app.createMigrationCommit(
      token,
      owner,
      name,
      {
        parentSha: current.baseSha!,
        treeSha: current.treeSha!,
        planId: plan.planId,
        createdAt: current.createdAt.toISOString().replace(/\.\d{3}Z$/, "Z"),
      },
      guard,
    );
    await record({ commitSha });
    await localAuthority();
  }
  const commit = await app.commit(token, owner, name, current.commitSha!);
  if (
    commit.tree.sha !== current.treeSha ||
    commit.parents?.length !== 1 ||
    commit.parents[0].sha !== current.baseSha
  )
    conflict();
  let head: string | null = null;
  try {
    head = await app.branchHead(token, owner, name, current.branch);
  } catch (error) {
    if (!(error instanceof GitHubDocsError) || error.status !== 404) throw error;
  }
  if (head && head !== current.commitSha) conflict();
  if (!head)
    await app.createMigrationBranch(
      token,
      owner,
      name,
      plan.planId,
      current.commitSha!,
      guard,
    );
  let pr = await app.findMigrationPullRequest(token, owner, name, {
    planId: plan.planId,
    base: plan.selection.branch,
    repositoryId: plan.selection.repositoryId,
  });
  if (pr && pr.headSha !== current.commitSha) conflict();
  if (!pr) {
    const docs = (await localAuthority()).plan.files.filter((file) => file.documentId);
    const draftCount = docs.filter(
      (file) =>
        splitDocsFrontmatter(file.markdown, file.path).frontmatter.published === false,
    ).length;
    const created = await app.createMigrationPullRequest(
      token,
      owner,
      name,
      {
        planId: plan.planId,
        base: plan.selection.branch,
        fileCount: plan.files.length,
        draftCount,
      },
      guard,
    );
    await record({ pullRequestNumber: created.number, pullRequestUrl: created.url });
    pr = await app.findMigrationPullRequest(token, owner, name, {
      planId: plan.planId,
      base: plan.selection.branch,
      repositoryId: plan.selection.repositoryId,
    });
    if (!pr || pr.headSha !== current.commitSha) conflict();
  } else await record({ pullRequestNumber: pr.number, pullRequestUrl: pr.url });
  if (!pr) return conflict();
  await localAuthority();
  const [finished] = await db
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
        eq(requests.leaseToken, leaseToken),
        eq(requests.status, "writing"),
      ),
    )
    .returning();
  if (!finished) throw new GitHubDocsError("GITHUB_SUPERSEDED", 409);
  return finished;
}

/** One bounded attempt per tick. Only transient faults retry automatically;
 * rejected authority/input requires an explicit reviewed retry. */
export async function processGitMigrationWrite(
  teamId?: string,
  injectedApp?: DocsGitHubApp,
  injectedConfig?: GitHubAppConfig,
) {
  const claimed = await claimGitMigrationWrite(teamId);
  if (!claimed) return null;
  try {
    const config = injectedConfig ?? getDocsGitHubAppConfig();
    return await writeGitMigration(
      claimed,
      injectedApp ?? new DocsGitHubApp(config),
      config,
    );
  } catch (error) {
    const code = error instanceof GitHubDocsError ? error.code : "GITHUB_UNAVAILABLE";
    const limited = code === "GITHUB_RATE_LIMITED";
    const transient =
      code === "GITHUB_UNAVAILABLE" ||
      (error instanceof GitHubDocsError && (error.status ?? 0) >= 500);
    const retry =
      limited || code === "RESTORE_PENDING" || (transient && claimed.attempts < 5);
    return db.transaction(async (tx) => {
      await lockSettings(tx, claimed.teamId);
      const current = await tx.query.documentationGitMigrationPrs.findFirst({
        where: eq(requests.planId, claimed.planId),
      });
      if (
        !current ||
        current.status !== "writing" ||
        current.leaseToken !== claimed.leaseToken ||
        !current.leaseExpiresAt ||
        current.leaseExpiresAt <= new Date()
      )
        return current;
      const [updated] = await tx
        .update(requests)
        .set({
          status: retry ? "queued" : "failed",
          diagnostic: code,
          leaseToken: null,
          leaseExpiresAt: null,
          finishedAt: retry ? null : new Date(),
          attempts:
            limited || code === "RESTORE_PENDING"
              ? Math.max(0, current.attempts - 1)
              : current.attempts,
          nextAttemptAt: new Date(
            Math.max(
              error instanceof GitHubDocsError ? (error.retryAt?.getTime() ?? 0) : 0,
              Date.now() +
                Math.min(300_000, 5000 * 2 ** Math.min(6, current.attempts - 1)),
            ),
          ),
        })
        .where(
          and(
            eq(requests.planId, claimed.planId),
            eq(requests.status, "writing"),
            eq(requests.leaseToken, claimed.leaseToken!),
          ),
        )
        .returning();
      return updated;
    });
  }
}
