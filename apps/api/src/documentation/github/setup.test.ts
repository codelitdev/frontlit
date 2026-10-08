import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, type TestDb } from "../../test/db";
vi.mock("../../db/client", async () => ({ db: await makeTestDb() }));
import { db as appDb } from "../../db/client";
import { eq } from "drizzle-orm";
import { documentationGitSetups as setups } from "../../db/schema";
import { decryptSecret } from "../../utils/crypto";
import type { AuthzContext } from "../../auth/authorize";
import { DocsGitHubApp, type GitHubAppConfig } from "./app";
import {
  authorizedSetup,
  cleanupGitHubSetups,
  completeGitHubSetup,
  listSetupRepositories,
  requireGitManager,
  startGitHubSetup,
  verifySetupRepository,
} from "./setup";
const db = appDb as unknown as TestDb;
const config: GitHubAppConfig = {
  appId: "42",
  appSlug: "frontlit-docs",
  clientId: "client",
  clientSecret: "secret",
  privateKey: "unused-mocked",
  callbackUrl: "http://localhost:4000/integrations/github/docs/callback",
  webhookSecret: "secret",
  webOrigin: "http://localhost:3000",
};
const repo = {
  id: 9,
  name: "docs",
  full_name: "org/docs",
  private: true,
  default_branch: "trunk",
  owner: { id: 8, login: "org" },
  permissions: { admin: true },
};
function provider() {
  return {
    exchangeCode: vi.fn().mockResolvedValue("temporary-user-token"),
    user: vi.fn().mockResolvedValue({ id: 123, login: "admin" }),
    installations: vi.fn().mockResolvedValue({
      installations: [
        {
          id: 7,
          app_id: 42,
          account: { login: "org", type: "Organization" },
          suspended_at: null,
          permissions: { contents: "read" },
        },
      ],
      total_count: 1,
    }),
    repositories: vi.fn().mockResolvedValue({ repositories: [repo], total_count: 1 }),
    repository: vi.fn().mockResolvedValue(repo),
    installation: vi.fn().mockResolvedValue({
      id: 7,
      app_id: 42,
      suspended_at: null,
      permissions: { contents: "read" },
    }),
    installationToken: vi.fn().mockResolvedValue({
      token: "repo-read-token",
      expires_at: "2030-01-01T00:00:00Z",
    }),
  };
}
describe("account-bound GitHub setup proof", () => {
  let teamId: string;
  let actor: AuthzContext;
  beforeEach(async () => {
    process.env.INTEGRATIONS_ENCRYPTION_KEY = "test-github-setup-encryption-key";
    const seed = await seedTeam(db);
    teamId = seed.team.id;
    actor = {
      teamId,
      accountId: seed.account.id,
      authKind: "session",
      isOwner: true,
      permissions: [],
      scopes: [],
      audiences: [],
    };
  });
  async function start() {
    const result = await startGitHubSetup(teamId, actor, {}, config);
    return {
      ...result,
      state: new URL(result.authorizationUrl).searchParams.get("state")!,
    };
  }
  async function authorize(mock = provider()) {
    const pending = await start();
    await completeGitHubSetup(
      pending.state,
      "code",
      config,
      mock as unknown as DocsGitHubApp,
    );
    return { pending, mock };
  }
  it("serializes setup admission at ten outstanding proofs and permits recovery after expiry", async () => {
    const attempts = await Promise.allSettled(
      Array.from({ length: 11 }, () => start()),
    );
    expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(10);
    const rejected = attempts.find(
      (r) => r.status === "rejected",
    ) as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "GITHUB_SETUP_LIMIT", status: 429 });
    const first = (
      attempts.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<
        Awaited<ReturnType<typeof start>>
      >
    ).value;
    await db
      .update(setups)
      .set({ expiresAt: new Date(0) })
      .where(eq(setups.setupId, first.setupId));
    expect((await start()).setupId).toBeTruthy();
  });
  it("stores only a hashed state and encrypted verifier bound to team/account/purpose with ten-minute expiry", async () => {
    const pending = await start();
    const row = (await db.query.documentationGitSetups.findFirst({
      where: eq(setups.setupId, pending.setupId),
    }))!;
    expect(row.stateHash).not.toBe(pending.state);
    expect(JSON.stringify(row)).not.toContain(pending.state);
    expect(decryptSecret(row.encryptedVerifier!)).toHaveLength(43);
    expect(row).toMatchObject({
      teamId,
      actorAccountId: actor.accountId,
      purpose: "connect",
      returnPath: "/settings/content?tab=source",
      status: "pending",
    });
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBeLessThanOrEqual(
      600_100,
    );
    await expect(
      startGitHubSetup(teamId, actor, { returnPath: "//attacker.invalid" }, config),
    ).rejects.toMatchObject({ code: "GITHUB_INVALID_RETURN_PATH" });
  });
  it("consumes callback state once without binding anything, never trusting installation query IDs", async () => {
    const { pending, mock } = await authorize();
    const row = await authorizedSetup(teamId, pending.setupId, actor);
    expect(row.encryptedVerifier).toBeNull();
    expect(row.githubUserId).toBe("123");
    expect(decryptSecret(row.encryptedUserToken!)).toBe("temporary-user-token");
    expect(await db.query.documentationGitBindings.findMany()).toEqual([]);
    await expect(
      completeGitHubSetup(
        pending.state,
        "code",
        config,
        mock as unknown as DocsGitHubApp,
      ),
    ).rejects.toMatchObject({ code: "GITHUB_SETUP_EXPIRED" });
    expect(mock.exchangeCode).toHaveBeenCalledTimes(1);
  });
  it("rejects API keys, foreign teams/accounts, insufficient manage scope and noninteractive final binding", async () => {
    const { pending } = await authorize();
    const other = await seedTeam(db);
    for (const context of [
      { ...actor, authKind: "apikey" as const },
      { ...actor, teamId: other.team.id },
      { ...actor, accountId: other.account.id },
      { ...actor, authKind: "oauth" as const, scopes: [] },
    ]) {
      await expect(
        authorizedSetup(teamId, pending.setupId, context),
      ).rejects.toBeInstanceOf(Error);
    }
    expect(() =>
      requireGitManager(
        teamId,
        {
          ...actor,
          authKind: "oauth",
          scopes: ["documentation:manage", "documentation:publish"],
        },
        true,
        true,
      ),
    ).toThrow("GITHUB_USER_AUTH_REQUIRED");
    expect(() =>
      requireGitManager(
        teamId,
        { ...actor, isOwner: false, permissions: ["documentation:manage"] },
        true,
        true,
      ),
    ).toThrow("GITHUB_USER_AUTH_REQUIRED");
  });
  it("destroys setup credentials on failed exchange and expired setup cleanup", async () => {
    const mock = provider();
    mock.exchangeCode.mockRejectedValue(new Error("provider rejected"));
    const pending = await start();
    await expect(
      completeGitHubSetup(
        pending.state,
        "code",
        config,
        mock as unknown as DocsGitHubApp,
      ),
    ).rejects.toThrow("provider rejected");
    expect(
      await db.query.documentationGitSetups.findFirst({
        where: eq(setups.setupId, pending.setupId),
      }),
    ).toMatchObject({
      status: "failed",
      encryptedUserToken: null,
      encryptedVerifier: null,
    });
    const { pending: authorized } = await authorize();
    await db
      .update(setups)
      .set({ expiresAt: new Date(0) })
      .where(eq(setups.setupId, authorized.setupId));
    await expect(
      authorizedSetup(teamId, authorized.setupId, actor),
    ).rejects.toMatchObject({ code: "GITHUB_SETUP_EXPIRED" });
    expect(await cleanupGitHubSetups()).toBeGreaterThanOrEqual(1);
    expect(
      await db.query.documentationGitSetups.findFirst({
        where: eq(setups.setupId, authorized.setupId),
      }),
    ).toMatchObject({
      status: "expired",
      encryptedUserToken: null,
      encryptedVerifier: null,
    });
  });
  it("lists only accessible repositories with verified admin permission and no credential projection", async () => {
    const { pending, mock } = await authorize();
    mock.repositories.mockResolvedValue({
      repositories: [repo, { ...repo, id: 10, permissions: { admin: false } }],
      total_count: 2,
    });
    const result = await listSetupRepositories(
      teamId,
      pending.setupId,
      actor,
      {},
      config,
      mock as unknown as DocsGitHubApp,
    );
    expect(result.repositories).toHaveLength(1);
    expect(result.installations).toEqual([
      { installationId: 7, accountLogin: "org", accountType: "Organization" },
    ]);
    expect(result.repositories[0]).toMatchObject({
      repositoryId: 9,
      defaultBranch: "trunk",
      private: true,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /temporary-user-token|encryptedUserToken|repo-read-token/,
    );
    await expect(
      listSetupRepositories(
        teamId,
        pending.setupId,
        actor,
        { installationId: 999 },
        config,
        mock as unknown as DocsGitHubApp,
      ),
    ).rejects.toMatchObject({ code: "GITHUB_REPOSITORY_NOT_AUTHORIZED" });
  });
  it("requires matching stable user, repository and owner IDs, repository administration and App read access", async () => {
    const { pending, mock } = await authorize();
    const selection = { installationId: 7, repositoryId: 9 };
    const verified = await verifySetupRepository(
      teamId,
      pending.setupId,
      actor,
      selection,
      config,
      mock as unknown as DocsGitHubApp,
    );
    expect(verified.repository.id).toBe(9);
    expect(mock.installationToken).toHaveBeenCalledWith(7, 9);
    mock.user.mockResolvedValue({ id: 124, login: "other" });
    await expect(
      verifySetupRepository(
        teamId,
        pending.setupId,
        actor,
        selection,
        config,
        mock as unknown as DocsGitHubApp,
      ),
    ).rejects.toMatchObject({ code: "GITHUB_REPOSITORY_NOT_AUTHORIZED" });
    mock.user.mockResolvedValue({ id: 123, login: "admin" });
    mock.repository.mockResolvedValue({
      ...repo,
      owner: { id: 999, login: "transferred" },
    });
    await expect(
      verifySetupRepository(
        teamId,
        pending.setupId,
        actor,
        selection,
        config,
        mock as unknown as DocsGitHubApp,
      ),
    ).rejects.toMatchObject({ code: "GITHUB_REPOSITORY_ADMIN_REQUIRED" });
    // Repository removed from the App installation after it was picked (V36).
    mock.repository.mockResolvedValue(repo);
    mock.repositories.mockResolvedValue({ repositories: [], total_count: 0 });
    await expect(
      verifySetupRepository(
        teamId,
        pending.setupId,
        actor,
        selection,
        config,
        mock as unknown as DocsGitHubApp,
      ),
    ).rejects.toMatchObject({ code: "GITHUB_ACCESS_LOST" });
  });
});
