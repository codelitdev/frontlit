import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, createHmac, randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import express from "express";
import { eq } from "drizzle-orm";
import { makeTestDb, seedTeam, truncateAll, type TestDb } from "../../test/db";
vi.mock("../../db/client", async () => ({ db: await makeTestDb() }));
vi.mock("./app", async (original) => {
  const actual = await original<typeof import("./app")>();
  return {
    ...actual,
    getDocsGitHubAppConfig: () => ({
      webhookSecret: "webhook-test-secret",
      appId: "42",
      webOrigin: "http://localhost:3000",
    }),
  };
});
import { db as appDb } from "../../db/client";
import {
  documentationGitBindings as bindings,
  documentationGitJobs as jobs,
  documentationGitDeliveries as deliveries,
  documentationGitSetups as setups,
  documentationSettings as settings,
  documentationGitProposals as proposals,
  documentationGitChecks as checks,
} from "../../db/schema";
import router, { receiveGitHubDelivery } from "./webhooks";
import { DocsGitHubApp, type GitHubAppConfig } from "./app";
import { startGitHubSetup } from "./setup";
import { decryptSecret } from "../../utils/crypto";
const db = appDb as unknown as TestDb;
const setupConfig: GitHubAppConfig = {
  appId: "42",
  appSlug: "frontlit-docs",
  clientId: "client",
  clientSecret: "secret",
  privateKey: "unused-mocked",
  callbackUrl: "http://localhost:4000/integrations/github/docs/callback",
  webhookSecret: "webhook-test-secret",
  webOrigin: "http://localhost:3000",
};
const push = {
  installation: { id: 7 },
  repository: { id: 9 },
  ref: "refs/heads/trunk",
};
describe("durable GitHub webhook admission", () => {
  let close: (() => Promise<void>) | undefined;
  beforeEach(async () => {
    vi.restoreAllMocks();
    process.env.INTEGRATIONS_ENCRYPTION_KEY = "test-github-callback-encryption-key";
    await truncateAll(db);
    await db.delete(deliveries);
  });
  afterEach(async () => {
    await close?.();
    close = undefined;
  });
  async function bind(
    status: typeof bindings.$inferInsert.status = "connected",
    repositoryId = "9",
  ) {
    const { team, account } = await seedTeam(db);
    await db.insert(settings).values({ teamId: team.id, source: "git" });
    await db.insert(bindings).values({
      teamId: team.id,
      installationId: "7",
      repositoryId,
      ownerId: "8",
      ownerLogin: "org",
      repositoryName: "docs",
      repositoryPrivate: true,
      branch: "trunk",
      directory: "docs",
      status,
      grantActorAccountId: account.id,
      grantGithubUserId: "123",
      repositoryAdminVerified: true,
      capabilities: { read: true, proposals: false, directCommit: false },
    });
    return { teamId: team.id, accountId: account.id };
  }
  async function http() {
    const app = express();
    app.use(router);
    app.use(express.json());
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    close = () =>
      new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    return async (
      body: string,
      options: {
        event?: string;
        delivery?: string;
        signature?: string;
        path?: string;
      } = {},
    ) => {
      const signature = createHmac("sha256", "webhook-test-secret")
        .update(body)
        .digest("hex");
      return fetch(origin + (options.path ?? "/integrations/github/webhook"), {
        method: "POST",
        body,
        headers: {
          "content-type": "application/json",
          "x-github-event": options.event ?? "push",
          "x-github-delivery": options.delivery ?? randomUUID(),
          "x-hub-signature-256": options.signature ?? `sha256=${signature}`,
        },
      });
    };
  }
  it("returns installation callbacks to setup without consuming an unbound code", async () => {
    const app = express();
    app.use(router);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    close = () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    for (const path of [
      "/integrations/github/callback",
      "/integrations/github/docs/callback",
    ]) {
      const response = await fetch(
        `${origin}${path}?code=unbound-code&installation_id=166984494&setup_action=install`,
        { redirect: "manual" },
      );
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(
        "http://localhost:3000/settings/integrations?tab=github&githubInstallationReturned=1",
      );
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
    const invalid = await fetch(
      `${origin}/integrations/github/callback?state=invalid&code=unbound-code&installation_id=166984494&setup_action=install`,
      { redirect: "manual" },
    );
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ code: "GITHUB_SETUP_EXPIRED" });
    expect(await db.query.documentationGitSetups.findMany()).toHaveLength(0);
  });
  it("completes a real setup callback once and redirects only to its bound workspace return path", async () => {
    const { team, account } = await seedTeam(db);
    const actor = {
      teamId: team.id,
      accountId: account.id,
      authKind: "session" as const,
      isOwner: true,
      permissions: [],
      scopes: [],
      audiences: [],
    };
    const setup = await startGitHubSetup(team.id, actor, {}, setupConfig);
    const authorization = new URL(setup.authorizationUrl);
    const state = authorization.searchParams.get("state")!;
    const challenge = authorization.searchParams.get("code_challenge")!;
    const exchangeCode = vi
      .spyOn(DocsGitHubApp.prototype, "exchangeCode")
      .mockResolvedValue("temporary-github-user-token");
    const user = vi
      .spyOn(DocsGitHubApp.prototype, "user")
      .mockResolvedValue({ id: 123, login: "workspace-admin" });

    const app = express();
    app.use(router);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    close = () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const callbackUrl = `${origin}/integrations/github/docs/callback?${new URLSearchParams({ state, code: "oauth-code" })}`;

    const callback = await fetch(callbackUrl, { redirect: "manual" });
    expect(callback.status).toBe(303);
    expect(callback.headers.get("cache-control")).toBe("private, no-store");
    expect(callback.headers.get("x-robots-tag")).toBe("noindex");
    expect(callback.headers.get("location")).toBe(
      `http://localhost:3000/settings/integrations?tab=github&githubSetup=${setup.setupId}`,
    );
    expect(exchangeCode).toHaveBeenCalledTimes(1);
    expect(exchangeCode).toHaveBeenCalledWith("oauth-code", expect.any(String));
    const verifier = exchangeCode.mock.calls[0][1];
    expect(createHash("sha256").update(verifier).digest("base64url")).toBe(challenge);
    expect(user).toHaveBeenCalledWith("temporary-github-user-token");

    const stored = await db.query.documentationGitSetups.findFirst({
      where: eq(setups.setupId, setup.setupId),
    });
    expect(stored).toMatchObject({
      status: "authorized",
      encryptedVerifier: null,
      githubUserId: "123",
      githubLogin: "workspace-admin",
    });
    expect(decryptSecret(stored!.encryptedUserToken!)).toBe(
      "temporary-github-user-token",
    );
    expect(await db.query.documentationGitBindings.findMany()).toHaveLength(0);

    const replay = await fetch(callbackUrl, { redirect: "manual" });
    expect(replay.status).toBe(400);
    expect(await replay.json()).toMatchObject({ code: "GITHUB_SETUP_EXPIRED" });
    expect(exchangeCode).toHaveBeenCalledTimes(1);
    expect(await db.query.documentationGitBindings.findMany()).toHaveLength(0);
  });
  it("verifies the exact raw bytes before JSON parsing and admits duplicate deliveries only once", async () => {
    const { teamId } = await bind();
    const post = await http();
    const body = JSON.stringify(
      {
        ...push,
        commits: [{ message: "private-webhook-message" }],
        sender: { id: 11, login: "private-login" },
      },
      null,
      2,
    );
    const delivery = randomUUID();
    expect((await post(body, { signature: "sha256=" + "0".repeat(64) })).status).toBe(
      401,
    );
    expect(await db.query.documentationGitDeliveries.findMany()).toHaveLength(0);
    expect((await post(body, { delivery })).status).toBe(202);
    expect(
      (await post(body, { delivery, path: "/integrations/github/docs/webhook" }))
        .status,
    ).toBe(202);
    expect(await db.query.documentationGitDeliveries.findMany()).toHaveLength(1);
    expect(
      await db.query.documentationGitJobs.findMany({ where: eq(jobs.teamId, teamId) }),
    ).toHaveLength(1);
    const receipt = (await db.query.documentationGitDeliveries.findFirst())!;
    const job = (await db.query.documentationGitJobs.findFirst())!;
    expect(receipt).toMatchObject({
      outcome: "queued",
      runIds: [job.runId],
      payload: { ref: "refs/heads/trunk" },
    });
    expect(JSON.stringify(receipt)).not.toMatch(
      /private-webhook-message|private-login|signature/,
    );
    expect(job.trigger).toBe("webhook");
    expect(
      await db.query.documentationGitBindings.findFirst({
        where: eq(bindings.teamId, teamId),
      }),
    ).toMatchObject({ requestedGeneration: 1 });
  });
  it("rejects malformed signed payloads and never acknowledges a failed durable transaction", async () => {
    await bind();
    const post = await http();
    expect((await post("{")).status).toBe(400);
    expect(
      (await post(JSON.stringify(push), { delivery: "-".repeat(36) })).status,
    ).toBe(400);
    expect((await post("{}", { event: "push" })).status).toBe(400);
    expect((await post("{}", { event: "ping" })).status).toBe(204);
    expect(await db.query.documentationGitDeliveries.findMany()).toHaveLength(1);
    expect(await db.query.documentationGitDeliveries.findFirst()).toMatchObject({
      event: "ping",
      outcome: "ignored",
      runIds: [],
    });
    vi.spyOn(db, "transaction").mockRejectedValueOnce(
      new Error("private database failure"),
    );
    const failed = await post(JSON.stringify(push));
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("private database failure");
    expect(await db.query.documentationGitDeliveries.findMany()).toHaveLength(1);
    expect((await post("x".repeat(2 * 1024 * 1024 + 1))).status).toBe(413);
  });
  it("ignores other branches and repositories while admitting each independent workspace binding", async () => {
    const first = await bind(),
      second = await bind(),
      other = await bind("connected", "10");
    const paused = await bind("paused");
    const ignored = randomUUID();
    expect(
      (
        await receiveGitHubDelivery(ignored, "push", {
          ...push,
          ref: "refs/heads/other",
        })
      ).relevant,
    ).toBe(false);
    expect(await receiveGitHubDelivery(ignored, "push", push)).toEqual({
      duplicate: true,
      relevant: false,
    });
    expect(await db.query.documentationGitJobs.findMany()).toHaveLength(0);
    await receiveGitHubDelivery(randomUUID(), "push", push);
    const queued = await db.query.documentationGitJobs.findMany();
    expect(queued.map((j) => j.teamId).sort()).toEqual(
      [first.teamId, second.teamId].sort(),
    );
    for (const untouched of [other, paused])
      expect(
        await db.query.documentationGitBindings.findFirst({
          where: eq(bindings.teamId, untouched.teamId),
        }),
      ).toMatchObject({ requestedGeneration: 0 });
  });
  it("fences queued work on lost access and restores only previously delegated, unpaused bindings", async () => {
    const connected = await bind(),
      paused = await bind("paused"),
      disconnected = await bind("disconnected");
    await receiveGitHubDelivery(randomUUID(), "push", push);
    await receiveGitHubDelivery(randomUUID(), "installation", {
      installation: { id: 7 },
      action: "suspend",
    });
    expect(
      await db.query.documentationGitBindings.findFirst({
        where: eq(bindings.teamId, connected.teamId),
      }),
    ).toMatchObject({ status: "access_lost", generation: 2 });
    expect(
      await db.query.documentationGitJobs.findFirst({
        where: eq(jobs.teamId, connected.teamId),
      }),
    ).toMatchObject({ status: "superseded", leaseToken: null });
    await receiveGitHubDelivery(randomUUID(), "installation", {
      installation: { id: 7, permissions: { contents: "none" } },
      action: "unsuspend",
    });
    expect(
      await db.query.documentationGitBindings.findFirst({
        where: eq(bindings.teamId, connected.teamId),
      }),
    ).toMatchObject({ status: "access_lost" });
    await receiveGitHubDelivery(randomUUID(), "installation", {
      installation: { id: 7, permissions: { contents: "read" } },
      action: "unsuspend",
    });
    expect(
      await db.query.documentationGitBindings.findFirst({
        where: eq(bindings.teamId, connected.teamId),
      }),
    ).toMatchObject({ status: "connected", generation: 3, requestedGeneration: 2 });
    expect(
      await db.query.documentationGitBindings.findFirst({
        where: eq(bindings.teamId, paused.teamId),
      }),
    ).toMatchObject({ status: "paused", generation: 1 });
    expect(
      await db.query.documentationGitBindings.findFirst({
        where: eq(bindings.teamId, disconnected.teamId),
      }),
    ).toMatchObject({ status: "disconnected", generation: 1 });
  });
  it("schedules PR review durably without trusting closure order or retaining private content", async () => {
    const { teamId } = await bind();
    const [proposal] = await db
      .insert(proposals)
      .values({
        teamId,
        idempotencyKey: randomUUID(),
        inputHash: "fixture",
        actorCredential: { kind: "apikey", keyId: "fixture" },
        connectionGeneration: 1,
        grantVersion: 1,
        mode: "pull_request",
        title: "Private draft",
        changes: [],
        status: "open",
        pullRequestNumber: 12,
        branch: "frontlit/docs/gproposal_fixture",
        nextAttemptAt: new Date(Date.now() + 600_000),
      })
      .returning();
    const delivery = randomUUID();
    const payload = {
      installation: { id: 7 },
      repository: { id: 9 },
      action: "closed",
      pull_request: {
        number: 12,
        merged: false,
        title: "private-pr-title",
        body: "private-pr-body",
        base: { ref: "trunk", repo: { id: 9 } },
        head: { ref: "frontlit/docs/gproposal_fixture", repo: { id: 9 } },
      },
    };
    const post = await http();
    expect(
      (await post(JSON.stringify(payload), { event: "pull_request", delivery })).status,
    ).toBe(202);
    expect(
      (await post(JSON.stringify(payload), { event: "pull_request", delivery })).status,
    ).toBe(202);
    const updated = (await db.query.documentationGitProposals.findFirst({
      where: eq(proposals.proposalId, proposal.proposalId),
    }))!;
    expect(updated.status).toBe("open");
    expect(updated.nextAttemptAt.getTime()).toBeLessThan(Date.now() + 1000);
    expect(await db.query.documentationGitJobs.findMany()).toHaveLength(0);
    const receipt = (await db.query.documentationGitDeliveries.findFirst())!;
    expect(receipt).toMatchObject({
      event: "pull_request",
      outcome: "queued",
      payload: { pullRequestNumber: 12, merged: false },
    });
    expect(JSON.stringify(receipt)).not.toMatch(/private-pr-title|private-pr-body/);
  });
  it("reconciles the configured publishing branch for a merged PR, ignores foreign targets and paused teams", async () => {
    const connected = await bind(),
      paused = await bind("paused"),
      other = await bind("connected", "10");
    const payload = {
      installation: { id: 7 },
      repository: { id: 9 },
      action: "closed",
      pull_request: {
        number: 12,
        merged: true,
        base: { ref: "trunk", repo: { id: 9 } },
        head: { ref: "external-review", repo: { id: 99 } },
      },
    };
    expect(
      await receiveGitHubDelivery(randomUUID(), "pull_request", {
        ...payload,
        pull_request: {
          ...payload.pull_request,
          base: { ref: "other", repo: { id: 9 } },
        },
      }),
    ).toMatchObject({ relevant: false });
    expect(
      await receiveGitHubDelivery(randomUUID(), "pull_request", payload),
    ).toMatchObject({ relevant: true });
    expect(await db.query.documentationGitJobs.findMany()).toMatchObject([
      { teamId: connected.teamId, trigger: "webhook", reviewedSha: null },
    ]);
    for (const untouched of [paused, other])
      expect(
        await db.query.documentationGitBindings.findFirst({
          where: eq(bindings.teamId, untouched.teamId),
        }),
      ).toMatchObject({ requestedGeneration: 0 });
    await expect(
      receiveGitHubDelivery(randomUUID(), "pull_request", {
        ...payload,
        pull_request: undefined,
      }),
    ).rejects.toMatchObject({ code: "GITHUB_INVALID_DELIVERY" });
  });
  it("queues external PR validation once per delivery and revalidates known PRs on base pushes", async () => {
    const { teamId } = await bind();
    const payload = {
      installation: { id: 7 },
      repository: { id: 9 },
      action: "opened",
      pull_request: {
        number: 44,
        merged: false,
        base: { ref: "trunk", repo: { id: 9 } },
        head: { ref: "external", repo: { id: 9 } },
      },
    };
    const delivery = randomUUID();
    await receiveGitHubDelivery(delivery, "pull_request", payload);
    await receiveGitHubDelivery(delivery, "pull_request", payload);
    const first = (await db.query.documentationGitChecks.findMany())[0];
    expect(await db.query.documentationGitChecks.findMany()).toHaveLength(1);
    expect(first).toMatchObject({ teamId, pullRequestNumber: 44, status: "queued" });
    await db
      .update(checks)
      .set({
        status: "validating",
        leaseToken: "old-worker",
        leaseExpiresAt: new Date(Date.now() + 60_000),
      })
      .where(eq(checks.checkId, first.checkId));
    await receiveGitHubDelivery(randomUUID(), "pull_request", {
      ...payload,
      action: "synchronize",
    });
    await receiveGitHubDelivery(randomUUID(), "push", push);
    const rows = await db.query.documentationGitChecks.findMany({
      where: eq(checks.teamId, teamId),
    });
    expect(rows).toHaveLength(3);
    expect(rows.filter((row) => row.status === "queued")).toHaveLength(1);
    expect(rows.find((row) => row.checkId === first.checkId)).toMatchObject({
      status: "superseded",
      leaseToken: null,
    });
    await receiveGitHubDelivery(randomUUID(), "push", {
      ...push,
      ref: "refs/heads/other",
    });
    expect(await db.query.documentationGitChecks.findMany()).toHaveLength(3);
  });
  it("retries only the exact publication report without enqueueing another import", async () => {
    const { teamId } = await bind();
    const [prior] = await db
      .insert(checks)
      .values({
        teamId,
        connectionGeneration: 1,
        syncRunId: "gsync_completed",
        status: "delivered",
        checkRunId: 22,
        publicationResult: {
          commitSha: "a".repeat(40),
          publicationId: "pub_original",
          outcome: "published",
          publishedCount: 0,
          diagnostics: [],
          policyEpoch: 0,
          purgeGeneration: 0,
        },
      })
      .returning();
    const payload = {
      installation: { id: 7 },
      repository: { id: 9 },
      action: "rerequested",
      check_run: {
        id: 22,
        name: "FrontLit / docs publication",
        app: { id: 42 },
        head_sha: "a".repeat(40),
        external_id: `frontlit:publication:${prior.checkId}`,
      },
    };
    expect(
      await receiveGitHubDelivery(randomUUID(), "check_run", {
        ...payload,
        check_run: { ...payload.check_run, head_sha: "b".repeat(40) },
      }),
    ).toMatchObject({ relevant: false });
    expect(
      await receiveGitHubDelivery(randomUUID(), "check_run", {
        ...payload,
        check_run: { ...payload.check_run, id: 99 },
      }),
    ).toMatchObject({ relevant: false });
    const delivery = randomUUID();
    expect(await receiveGitHubDelivery(delivery, "check_run", payload)).toMatchObject({
      relevant: true,
    });
    expect(await receiveGitHubDelivery(delivery, "check_run", payload)).toMatchObject({
      duplicate: true,
    });
    expect(await db.query.documentationGitChecks.findMany()).toHaveLength(1);
    expect(await db.query.documentationGitChecks.findFirst()).toMatchObject({
      status: "reporting",
      publicationResult: { outcome: "published", commitSha: "a".repeat(40) },
    });
    expect(await db.query.documentationGitJobs.findMany()).toHaveLength(0);
  });
  it("scopes rerequests to the App, repository and exact recorded check without retaining output prose", async () => {
    const { teamId } = await bind();
    const [prior] = await db
      .insert(checks)
      .values({
        teamId,
        connectionGeneration: 1,
        pullRequestNumber: 44,
        status: "delivered",
        checkRunId: 11,
        result: {
          docsDraftVersion: 1,
          policyEpoch: 1,
          purgeGeneration: 1,
          number: 44,
          headSha: "a".repeat(40),
          baseSha: "b".repeat(40),
          mergeSha: "c".repeat(40),
          outcome: "valid",
          fileCount: 0,
          publishedCount: 0,
          diagnostics: [],
        },
      })
      .returning();
    const payload = {
      installation: { id: 7 },
      repository: { id: 9 },
      action: "rerequested",
      check_run: {
        id: 11,
        name: "FrontLit / docs validation",
        app: { id: 42 },
        head_sha: "a".repeat(40),
        external_id: `frontlit:validation:${prior.checkId}`,
        output: { summary: "private-output-prose" },
      },
    };
    expect(
      await receiveGitHubDelivery(randomUUID(), "check_run", {
        ...payload,
        check_run: { ...payload.check_run, app: { id: 99 } },
      }),
    ).toMatchObject({ relevant: false });
    expect(
      await receiveGitHubDelivery(randomUUID(), "check_run", {
        ...payload,
        repository: { id: 10 },
      }),
    ).toMatchObject({ relevant: false });
    expect(
      await receiveGitHubDelivery(randomUUID(), "check_run", {
        ...payload,
        check_run: { ...payload.check_run, head_sha: "d".repeat(40) },
      }),
    ).toMatchObject({ relevant: false });
    const delivery = randomUUID();
    expect(await receiveGitHubDelivery(delivery, "check_run", payload)).toMatchObject({
      relevant: true,
    });
    await receiveGitHubDelivery(delivery, "check_run", payload);
    expect(await db.query.documentationGitChecks.findMany()).toHaveLength(2);
    expect(
      JSON.stringify(await db.query.documentationGitDeliveries.findMany()),
    ).not.toContain("private-output-prose");
    await expect(
      receiveGitHubDelivery(randomUUID(), "check_run", {
        ...payload,
        check_run: undefined,
      }),
    ).rejects.toMatchObject({ code: "GITHUB_INVALID_DELIVERY" });
  });
  it("repository removal is scoped by stable ID and user OAuth revocation clears setup tokens without revoking the workspace delegation", async () => {
    const first = await bind(),
      other = await bind("connected", "10");
    await db.insert(setups).values({
      teamId: other.teamId,
      actorAccountId: other.accountId,
      stateHash: randomUUID(),
      githubUserId: "123",
      encryptedUserToken: "encrypted-private-token",
      encryptedVerifier: "encrypted-verifier",
      purpose: "connect",
      returnPath: "/content?type=documentation",
      status: "authorized",
      expiresAt: new Date(Date.now() + 600000),
    });
    await receiveGitHubDelivery(randomUUID(), "installation_repositories", {
      installation: { id: 7 },
      action: "removed",
      repositories_removed: [{ id: 9 }],
    });
    expect(
      await db.query.documentationGitBindings.findFirst({
        where: eq(bindings.teamId, first.teamId),
      }),
    ).toMatchObject({ status: "access_lost" });
    await receiveGitHubDelivery(randomUUID(), "github_app_authorization", {
      sender: { id: 123 },
      action: "revoked",
    });
    expect(await db.query.documentationGitSetups.findFirst()).toMatchObject({
      status: "failed",
      encryptedUserToken: null,
      encryptedVerifier: null,
    });
    expect(
      await db.query.documentationGitBindings.findFirst({
        where: eq(bindings.teamId, other.teamId),
      }),
    ).toMatchObject({ status: "connected", generation: 1 });
    expect(await db.query.documentationGitJobs.findMany()).toHaveLength(0);
  });
});
