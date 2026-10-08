import { createHash } from "node:crypto";
import { and, eq, lte, inArray } from "drizzle-orm";
import type { AuthzContext } from "../../auth/authorize";
import { db } from "../../db/client";
import { documentationGitSetups as setups } from "../../db/schema";
import { encryptSecret, decryptSecret } from "../../utils/crypto";
import { lockSettings } from "../authoring";
import { requireGitPlanCapacity } from "./admission";
import {
  createSetupProof,
  DocsGitHubApp,
  getDocsGitHubAppConfig,
  githubAuthorizationUrl,
  GitHubDocsError,
  type GitHubAppConfig,
} from "./app";

const SETUP_TTL_MS = 10 * 60 * 1000;
export function requireGitManager(
  teamId: string,
  actor: AuthzContext,
  interactive = false,
  publish = false,
) {
  if (
    actor.teamId !== teamId ||
    !actor.accountId ||
    actor.authKind === "apikey" ||
    (!actor.isOwner && !actor.permissions.includes("documentation:manage")) ||
    (publish &&
      !actor.isOwner &&
      !actor.permissions.includes("documentation:publish")) ||
    (actor.authKind === "oauth" &&
      (!actor.scopes.includes("documentation:manage") ||
        (publish && !actor.scopes.includes("documentation:publish")))) ||
    (interactive && actor.authKind !== "session")
  )
    throw new GitHubDocsError("GITHUB_USER_AUTH_REQUIRED", 403);
}
export function requireSetupReturnPath(path: string) {
  // No arbitrary redirects, hashes, credentials or cross-workspace destinations.
  if (path !== "/content?type=documentation" && path !== "/settings/content?tab=source")
    throw new GitHubDocsError("GITHUB_INVALID_RETURN_PATH", 400);
  return path;
}
export async function startGitHubSetup(
  teamId: string,
  actor: AuthzContext,
  input: {
    purpose?: "connect" | "reconnect" | "upgrade";
    returnPath?: string;
  } = {},
  config = getDocsGitHubAppConfig(),
) {
  requireGitManager(teamId, actor);
  const returnPath = requireSetupReturnPath(
    input.returnPath ?? "/settings/content?tab=source",
  );
  const proof = createSetupProof();
  const expiresAt = new Date(Date.now() + SETUP_TTL_MS);
  const row = await db.transaction(async (tx) => {
    await lockSettings(tx, teamId);
    await requireGitPlanCapacity(tx, teamId);
    const [created] = await tx
      .insert(setups)
      .values({
        teamId,
        actorAccountId: actor.accountId!,
        stateHash: proof.stateHash,
        encryptedVerifier: encryptSecret(proof.verifier),
        returnPath,
        purpose: input.purpose ?? "connect",
        expiresAt,
      })
      .returning();
    return created;
  });
  return {
    setupId: row.setupId,
    authorizationUrl: githubAuthorizationUrl(config, proof.state, proof.challenge),
    expiresAt,
  };
}

/** Callback cannot bind a workspace. Claim single-use state before token exchange. */
export async function completeGitHubSetup(
  state: string,
  code: string,
  config = getDocsGitHubAppConfig(),
  app = new DocsGitHubApp(config),
) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(state) || !code || code.length > 1024)
    throw new GitHubDocsError("GITHUB_SETUP_EXPIRED", 400);
  const stateHash = createHash("sha256").update(state).digest("hex");
  const now = new Date();
  const existing = await db.query.documentationGitSetups.findFirst({
    where: eq(setups.stateHash, stateHash),
  });
  if (
    !existing ||
    existing.status !== "pending" ||
    existing.expiresAt <= now ||
    !existing.encryptedVerifier
  )
    throw new GitHubDocsError("GITHUB_SETUP_EXPIRED", 400);
  const [claimed] = await db
    .update(setups)
    .set({ status: "verifying" })
    .where(and(eq(setups.setupId, existing.setupId), eq(setups.status, "pending")))
    .returning();
  if (!claimed) throw new GitHubDocsError("GITHUB_SETUP_EXPIRED", 400);
  try {
    const token = await app.exchangeCode(
      code,
      decryptSecret(claimed.encryptedVerifier!),
    );
    const user = await app.user(token);
    if (claimed.expiresAt <= new Date())
      throw new GitHubDocsError("GITHUB_SETUP_EXPIRED", 400);
    const [authorized] = await db
      .update(setups)
      .set({
        status: "authorized",
        encryptedVerifier: null,
        encryptedUserToken: encryptSecret(token),
        githubUserId: String(user.id),
        githubLogin: user.login,
      })
      .where(and(eq(setups.setupId, claimed.setupId), eq(setups.status, "verifying")))
      .returning();
    if (!authorized) throw new GitHubDocsError("GITHUB_SETUP_EXPIRED", 400);
    return { setupId: authorized.setupId, returnPath: authorized.returnPath };
  } catch (error) {
    await db
      .update(setups)
      .set({ status: "failed", encryptedVerifier: null, encryptedUserToken: null })
      .where(and(eq(setups.setupId, claimed.setupId), eq(setups.status, "verifying")));
    throw error;
  }
}

export async function authorizedSetup(
  teamId: string,
  setupId: string,
  actor: AuthzContext,
  executor: any = db,
) {
  requireGitManager(teamId, actor);
  const row = await executor.query.documentationGitSetups.findFirst({
    where: and(
      eq(setups.teamId, teamId),
      eq(setups.setupId, setupId),
      eq(setups.actorAccountId, actor.accountId!),
    ),
  });
  if (
    !row ||
    row.status !== "authorized" ||
    row.expiresAt <= new Date() ||
    !row.encryptedUserToken ||
    !row.githubUserId
  )
    throw new GitHubDocsError("GITHUB_SETUP_EXPIRED", 409);
  return row;
}
async function accessibleInstallations(
  token: string,
  config: GitHubAppConfig,
  app: DocsGitHubApp,
) {
  const result = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await app.installations(token, page);
    if (!Array.isArray(batch.installations))
      throw new GitHubDocsError("GITHUB_INVALID_RESPONSE");
    result.push(
      ...batch.installations.filter(
        (i) =>
          String(i.app_id) === config.appId &&
          !i.suspended_at &&
          ["read", "write"].includes(i.permissions.contents),
      ),
    );
    if (batch.installations.length < 100) return result;
  }
  throw new GitHubDocsError("GITHUB_INSTALLATION_LIST_TOO_LARGE");
}
export async function listSetupRepositories(
  teamId: string,
  setupId: string,
  actor: AuthzContext,
  input: { installationId?: number; page?: number } = {},
  config = getDocsGitHubAppConfig(),
  app = new DocsGitHubApp(config),
) {
  const setup = await authorizedSetup(teamId, setupId, actor);
  const token = decryptSecret(setup.encryptedUserToken!);
  const installations = await accessibleInstallations(token, config, app);
  if (
    !Number.isSafeInteger(input.page ?? 1) ||
    (input.page ?? 1) < 1 ||
    (input.page ?? 1) > 100
  )
    throw new GitHubDocsError("GITHUB_INVALID_REQUEST", 400);
  const installationId = input.installationId ?? installations[0]?.id;
  if (installationId === undefined)
    return {
      installations: [],
      repositories: [],
      nextPage: null,
      installUrl: `https://github.com/apps/${encodeURIComponent(config.appSlug)}/installations/new`,
    };
  if (!installations.some((i) => i.id === installationId))
    throw new GitHubDocsError("GITHUB_REPOSITORY_NOT_AUTHORIZED", 403);
  const page = input.page ?? 1;
  const batch = await app.repositories(token, installationId, page);
  if (!Array.isArray(batch.repositories))
    throw new GitHubDocsError("GITHUB_INVALID_RESPONSE");
  return {
    installations: installations.map((i) => ({
      installationId: i.id,
      accountLogin: i.account.login,
      accountType: i.account.type,
    })),
    installationId,
    repositories: batch.repositories
      .filter((r) => r.permissions?.admin === true)
      .map((r) => ({
        repositoryId: r.id,
        ownerId: r.owner.id,
        owner: r.owner.login,
        name: r.name,
        fullName: r.full_name,
        private: r.private,
        defaultBranch: r.default_branch,
      })),
    nextPage: batch.repositories.length === 100 ? page + 1 : null,
    installUrl: null,
  };
}

/** Verify both current user authority and the App's independently installed access. */
export async function verifySetupRepository(
  teamId: string,
  setupId: string,
  actor: AuthzContext,
  selection: { installationId: number; repositoryId: number },
  config = getDocsGitHubAppConfig(),
  app = new DocsGitHubApp(config),
) {
  const setup = await authorizedSetup(teamId, setupId, actor);
  const token = decryptSecret(setup.encryptedUserToken!);
  const user = await app.user(token);
  if (String(user.id) !== setup.githubUserId)
    throw new GitHubDocsError("GITHUB_REPOSITORY_NOT_AUTHORIZED", 403);
  const installations = await accessibleInstallations(token, config, app);
  if (!installations.some((i) => i.id === selection.installationId))
    throw new GitHubDocsError("GITHUB_REPOSITORY_NOT_AUTHORIZED", 403);
  let found;
  for (let page = 1; page <= 100; page++) {
    const batch = await app.repositories(token, selection.installationId, page);
    found = batch.repositories.find((r) => r.id === selection.repositoryId);
    if (found || batch.repositories.length < 100) break;
  }
  // Missing from the installation means the App's repository grant was removed.
  if (!found) throw new GitHubDocsError("GITHUB_ACCESS_LOST", 403);
  if (!found.permissions?.admin)
    throw new GitHubDocsError("GITHUB_REPOSITORY_ADMIN_REQUIRED", 403);
  const repository = await app.repository(token, found.owner.login, found.name);
  if (
    repository.id !== selection.repositoryId ||
    repository.owner.id !== found.owner.id ||
    !repository.permissions?.admin
  )
    throw new GitHubDocsError("GITHUB_REPOSITORY_ADMIN_REQUIRED", 403);
  const installation = await app.installation(selection.installationId);
  if (
    installation.id !== selection.installationId ||
    String(installation.app_id) !== config.appId ||
    installation.suspended_at ||
    !["read", "write"].includes(installation.permissions.contents)
  )
    throw new GitHubDocsError("GITHUB_ACCESS_LOST", 403);
  const installationToken = await app.installationToken(
    selection.installationId,
    selection.repositoryId,
  );
  const visible = await app.repository(
    installationToken.token,
    repository.owner.login,
    repository.name,
  );
  if (visible.id !== repository.id || visible.owner.id !== repository.owner.id)
    throw new GitHubDocsError("GITHUB_ACCESS_LOST", 403);
  return { setup, repository, installationToken: installationToken.token };
}

export async function cleanupGitHubSetups(now = new Date()) {
  // Clear credentials immediately; retain minimal expired context for bounded diagnostics.
  const expired = await db.query.documentationGitSetups.findMany({
    where: and(
      lte(setups.expiresAt, now),
      inArray(setups.status, ["pending", "verifying", "authorized", "failed"]),
    ),
    limit: 100,
  });
  if (!expired.length) return 0;
  await db
    .update(setups)
    .set({ status: "expired", encryptedVerifier: null, encryptedUserToken: null })
    .where(
      inArray(
        setups.setupId,
        expired.map((s) => s.setupId),
      ),
    );
  return expired.length;
}
