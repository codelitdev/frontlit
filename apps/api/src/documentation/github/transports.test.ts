import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, type TestDb } from "../../test/db";
import { z } from "zod";
import { eq } from "drizzle-orm";
import {
  apiKeys,
  documents,
  documentationSettings,
  documentationGitBindings,
  documentationGitProposals,
  documentationGitChecks,
  accounts,
  authUser,
  authSession,
  teamMembers,
  authOAuthClient,
  authOAuthConsent,
} from "../../db/schema";
vi.mock("../../db/client", async () => ({ db: await makeTestDb() }));
vi.mock("../../auth/middleware", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));
vi.mock("../../auth/require-team", () => ({
  requireTeam: (_req: any, _res: any, next: any) => next(),
}));
// Domain/transport parity here; real operation middleware is covered separately.
vi.mock("../../auth/authorize", () => ({
  authorizeHandlers: (handlers: unknown) => handlers,
}));
import type { AuthzContext } from "../../auth/authorize";
import { db as appDb } from "../../db/client";
import router from "./routes";
import { registerDocumentationGitHubTools } from "../../mcp/tools/documentation-github";
import * as gitApp from "./app";
import { completeGitHubSetup } from "./setup";
import { saveDocumentation, getDocsSettings } from "../authoring";
import {
  documentationGitMigrationSchema,
  documentationGitSourceSchema,
  documentationGitProposalSchema,
  documentationGitCheckSchema,
  documentationGitMigrationPrSchema,
} from "@frontlit/api-contract";
const db = appDb as unknown as TestDb;
const config: gitApp.GitHubAppConfig = {
  appId: "42",
  appSlug: "test",
  clientId: "client",
  clientSecret: "secret",
  privateKey: "unused",
  callbackUrl: "http://localhost:4000/integrations/github/callback",
  webhookSecret: "secret",
  webOrigin: "http://localhost:3000",
};
const tools = new Map<string, { config: any; handler: any }>();
registerDocumentationGitHubTools({
  registerTool: (name, config, handler) => {
    tools.set(name, { config, handler });
  },
});
describe("Git source and adoption REST/MCP domain parity", () => {
  let server: Server, origin: string, actor: AuthzContext;
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).teamId = actor.teamId;
      (req as any).authz = actor;
      next();
    });
    app.use(router);
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    if (server?.listening)
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
  });
  beforeEach(async () => {
    vi.restoreAllMocks();
    process.env.INTEGRATIONS_ENCRYPTION_KEY = "transport-test-encryption-key";
    const { team, account } = await seedTeam(db);
    actor = {
      teamId: team.id,
      accountId: account.id,
      authKind: "session",
      isOwner: true,
      permissions: [],
      scopes: [],
      audiences: [],
    };
    vi.spyOn(gitApp, "getDocsGitHubAppConfig").mockReturnValue(config);
    const proto = gitApp.DocsGitHubApp.prototype;
    vi.spyOn(proto, "exchangeCode").mockResolvedValue("temporary-user-token");
    vi.spyOn(proto, "user").mockResolvedValue({ id: 123, login: "admin" });
    vi.spyOn(proto, "installations").mockResolvedValue({
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
    });
    const repository = {
      id: 9,
      name: "docs",
      full_name: "org/docs",
      private: true,
      default_branch: "trunk",
      owner: { id: 8, login: "org" },
      permissions: { admin: true },
    };
    vi.spyOn(proto, "repositories").mockResolvedValue({
      repositories: [repository],
      total_count: 1,
    });
    vi.spyOn(proto, "repository").mockResolvedValue(repository);
    vi.spyOn(proto, "installation").mockResolvedValue({
      id: 7,
      app_id: 42,
      suspended_at: null,
      permissions: { contents: "read" },
    });
    vi.spyOn(proto, "installationToken").mockResolvedValue({
      token: "read-only-token",
      expires_at: "2030-01-01T00:00:00Z",
    });
    vi.spyOn(proto, "branchHead").mockResolvedValue("a".repeat(40));
  });
  async function request(
    path: string,
    body?: unknown,
    method = body === undefined ? "GET" : "POST",
    extraHeaders: Record<string, string> = {},
  ) {
    const response = await fetch(origin + "/content/documentation/github" + path, {
      method,
      headers: {
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...extraHeaders,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { response, data: (await response.json()) as any };
  }
  async function mcp(
    name: string,
    args: any,
    override: any = {},
    authOverride: any = {},
  ) {
    const tool = tools.get(name)!;
    const result = await tool.handler(
      z.object(tool.config.inputSchema).strict().parse(args),
      {
        http: {
          authInfo: {
            token: actor.authKind === "apikey" ? actor.apiKeyId : "test-token",
            clientId: "test",
            scopes: [
              "documentation:manage",
              "documentation:publish",
              "documentation:read",
            ],
            ...authOverride,
            extra: {
              authKind: "oauth",
              teamId: actor.teamId,
              account: { id: actor.accountId },
              isOwner: true,
              permissions: [],
              ...override,
            },
          },
        },
      },
    );
    return {
      result,
      data: result.structuredContent ?? JSON.parse(result.content[0].text),
    };
  }
  it("serves publication outcomes through identical private REST/MCP reports", async () => {
    const policy = await getDocsSettings(actor.teamId!);
    const [check] = await db
      .insert(documentationGitChecks)
      .values({
        teamId: actor.teamId!,
        connectionGeneration: 1,
        syncRunId: "gsync_private_publication",
        status: "reporting",
        lastError: "GITHUB_UNAVAILABLE",
        errorPhase: "delivery",
        publicationResult: {
          commitSha: "a".repeat(40),
          publicationId: null,
          outcome: "failed",
          publishedCount: 0,
          policyEpoch: policy.policyEpoch,
          purgeGeneration: policy.purgeGeneration,
          diagnostics: [
            {
              code: "INVALID_DOCUMENT",
              severity: "error",
              blocksSave: false,
              blocksPublish: true,
              message: "private-publication-diagnostic",
            },
          ],
        },
      })
      .returning();
    const http = await request(`/checks/${check.checkId}`);
    const model = await mcp("get_documentation_github_check", {
      checkId: check.checkId,
    });
    expect(http.response.status).toBe(200);
    expect(http.response.headers.get("cache-control")).toBe("private, no-store");
    expect(documentationGitCheckSchema.parse(http.data)).toMatchObject({
      kind: "publication",
      errorPhase: "delivery",
      publicationResult: { outcome: "failed", redacted: false },
    });
    expect(model.data).toEqual(http.data);
    const list = await request("/checks?limit=20");
    expect(list.data).toEqual(
      (await mcp("list_documentation_github_checks", { limit: 20 })).data,
    );
    expect(JSON.stringify(list.data)).not.toContain("private-publication-diagnostic");
    await db
      .update(documentationSettings)
      .set({ purgeGeneration: policy.purgeGeneration + 1 })
      .where(eq(documentationSettings.teamId, actor.teamId!));
    expect((await request(`/checks/${check.checkId}`)).data).toMatchObject({
      publicationResult: {
        outcome: "failed",
        redacted: true,
        diagnostics: [],
      },
    });
  });
  it("serves private check summaries and redacted reports through identical REST/MCP services", async () => {
    const policy = await getDocsSettings(actor.teamId!);
    const [check] = await db
      .insert(documentationGitChecks)
      .values({
        teamId: actor.teamId!,
        connectionGeneration: 1,
        pullRequestNumber: 12,
        status: "reporting",
        lastError: "GITHUB_UNAVAILABLE",
        errorPhase: "delivery",
        leaseToken: "private-lease",
        result: {
          docsDraftVersion: policy.draftVersion,
          policyEpoch: policy.policyEpoch,
          purgeGeneration: policy.purgeGeneration,
          number: 12,
          headSha: "a".repeat(40),
          baseSha: "b".repeat(40),
          mergeSha: "c".repeat(40),
          outcome: "valid",
          fileCount: 1,
          publishedCount: 1,
          diagnostics: [
            {
              code: "WARNING",
              severity: "warning",
              blocksSave: false,
              blocksPublish: false,
              message: "private-check-prose",
              file: "docs/guide.md",
            },
          ],
        },
      })
      .returning();
    const http = await request(`/checks/${check.checkId}`),
      model = await mcp("get_documentation_github_check", { checkId: check.checkId });
    expect(http.response.status).toBe(200);
    expect(http.response.headers.get("cache-control")).toBe("private, no-store");
    expect(http.response.headers.get("x-robots-tag")).toBe("noindex");
    expect(documentationGitCheckSchema.parse(http.data)).toEqual(model.data);
    expect(JSON.stringify(http.data)).not.toMatch(
      /private-lease|leaseToken|policyEpoch|purgeGeneration/,
    );
    const list = await request("/checks?limit=1");
    expect(list.data).toEqual(
      (await mcp("list_documentation_github_checks", { limit: 1 })).data,
    );
    expect(JSON.stringify(list.data)).not.toContain("private-check-prose");
    await db
      .update(documentationSettings)
      .set({ policyEpoch: policy.policyEpoch + 1 })
      .where(eq(documentationSettings.teamId, actor.teamId!));
    const redacted = await request(`/checks/${check.checkId}`);
    expect(redacted.data).toMatchObject({
      result: { outcome: "valid", redacted: true, diagnostics: [] },
    });
    expect(redacted.data).toEqual(
      (await mcp("get_documentation_github_check", { checkId: check.checkId })).data,
    );
    expect((await request("/checks?limit=51")).response.status).toBe(400);
    const other = await seedTeam(db);
    actor = { ...actor, teamId: other.team.id };
    expect((await request(`/checks/${check.checkId}`)).response.status).toBe(404);
    expect(
      (await mcp("get_documentation_github_check", { checkId: check.checkId })).data,
    ).toMatchObject({ code: "GITHUB_CHECK_NOT_FOUND" });
  });
  async function proposalFixture() {
    const [key] = await db
      .insert(apiKeys)
      .values({
        teamId: actor.teamId!,
        keyHash: crypto.randomUUID(),
        keyPrefix: "test",
      })
      .returning();
    const doc = (await saveDocumentation(actor.teamId!, null, {
      title: "Private proposal",
      markdown: "Captured secret prose",
    }))!;
    await db
      .update(documents)
      .set({ draftGitSource: { sourcePath: "docs/proposal.md", base: null } })
      .where(eq(documents.documentId, doc.documentId));
    await db
      .update(documentationSettings)
      .set({ source: "git" })
      .where(eq(documentationSettings.teamId, actor.teamId!));
    await db.insert(documentationGitBindings).values({
      teamId: actor.teamId!,
      installationId: "7",
      repositoryId: "9",
      ownerId: "8",
      ownerLogin: "org",
      repositoryName: "docs",
      repositoryPrivate: true,
      branch: "trunk",
      directory: "docs",
      status: "connected",
      grantActorAccountId: actor.accountId!,
      grantGithubUserId: "123",
      repositoryAdminVerified: true,
      capabilities: { read: true, proposals: true, directCommit: false },
    });
    actor = { ...actor, authKind: "apikey", apiKeyId: key.id, isOwner: false };
    const body = {
      title: "Review private proposal",
      selected: [{ documentId: doc.documentId, expectedDraftVersion: 1 }],
      idempotencyKey: "transport-proposal",
    };
    return { key, doc, body };
  }
  it("shares exact-version proposal admission and private status across REST and MCP API-key contexts", async () => {
    const f = await proposalFixture();
    const http = await request("/proposals", f.body);
    const model = await mcp("submit_documentation_github_proposal", f.body, {
      authKind: "api_key",
    });
    expect(http.response.status).toBe(202);
    const listing = await request("/proposals?limit=1");
    const modelListing = await mcp(
      "list_documentation_github_proposals",
      { limit: 1 },
      { authKind: "api_key" },
    );
    expect(listing.response.status).toBe(200);
    expect(listing.response.headers.get("cache-control")).toBe("private, no-store");
    expect(modelListing.data).toEqual(listing.data);
    expect(listing.data.items).toMatchObject([
      { proposalId: http.data.proposalId, mergedCommitSha: null },
    ]);
    expect((await request("/proposals?limit=51")).response.status).toBe(400);

    expect(model.result.isError).not.toBe(true);
    expect(documentationGitProposalSchema.parse(http.data)).toEqual(model.data);
    expect(JSON.stringify(http.data)).not.toMatch(
      /Captured secret prose|actorCredential|keyId/,
    );
    const status = await request(`/proposals/${http.data.proposalId}`);
    const statusMcp = await mcp(
      "get_documentation_github_proposal",
      { proposalId: http.data.proposalId },
      { authKind: "api_key" },
    );
    expect(status.response.status).toBe(200);
    expect(status.data).toEqual(statusMcp.data);
    expect(status.response.headers.get("cache-control")).toBe("private, no-store");
    expect(status.response.headers.get("x-robots-tag")).toBe("noindex");
    expect(
      await db.query.documentationGitProposals.findMany({
        where: eq(documentationGitProposals.teamId, actor.teamId!),
      }),
    ).toHaveLength(1);
  });
  it("rejects credential revocation, stale versions and extra proposal fields through the transport", async () => {
    const f = await proposalFixture();
    expect(
      (
        await request("/proposals", {
          ...f.body,
          selected: [{ documentId: f.doc.documentId, expectedDraftVersion: 2 }],
        })
      ).response.status,
    ).toBe(409);
    expect(
      (
        await request("/proposals", {
          ...f.body,
          actorCredential: { kind: "apikey", keyId: f.key.id },
        })
      ).response.status,
    ).toBe(400);
    await db.delete(apiKeys).where(eq(apiKeys.id, f.key.id));
    expect((await request("/proposals", f.body)).response.status).toBe(403);
    expect(
      (
        await mcp("submit_documentation_github_proposal", f.body, {
          authKind: "api_key",
        })
      ).result.isError,
    ).toBe(true);
  });
  it("returns the same unavailable status for absent and another team's proposals", async () => {
    const f = await proposalFixture(),
      created = await request("/proposals", f.body);
    const other = await seedTeam(db);
    actor = { ...actor, teamId: other.team.id };
    const cross = await request(`/proposals/${created.data.proposalId}`),
      missing = await request("/proposals/gproposal_missing");
    expect(cross.response.status).toBe(404);
    expect(cross.data).toEqual(missing.data);
  });
  async function setup() {
    const { response, data } = await request("/setup", {});
    expect(response.status).toBe(201);
    await completeGitHubSetup(
      new URL(data.authorizationUrl).searchParams.get("state")!,
      "code",
    );
    return data.setupId as string;
  }
  it("projects source status and accessible repositories identically, with private no-store responses", async () => {
    const http = await request("");
    const model = await mcp("get_documentation_github", {});
    expect(http.response.status).toBe(200);
    expect(http.response.headers.get("cache-control")).toBe("private, no-store");
    expect(http.response.headers.get("x-robots-tag")).toBe("noindex");
    expect(documentationGitSourceSchema.parse(http.data)).toEqual(model.data);
    const id = await setup();
    const rest = await request(`/setup/${id}/repositories`);
    const tool = await mcp("list_documentation_github_repositories", { setupId: id });
    expect(rest.data).toEqual(tool.data);
    expect(JSON.stringify(rest.data)).not.toMatch(
      /user-token|read-only-token|privateKey|clientSecret/,
    );
  });
  it("exports the same private migration pages over REST and MCP and rejects unknown fields", async () => {
    await saveDocumentation(actor.teamId!, null, {
      title: "Private draft",
      markdown: "Only the administrator should receive this export.",
    });
    const id = await setup(),
      settings = await getDocsSettings(actor.teamId!);
    const body = {
      setupId: id,
      installationId: 7,
      repositoryId: 9,
      branch: "trunk",
      directory: "docs",
      expectedDocsDraftVersion: settings.draftVersion,
      expectedPublicationId: settings.activePublicationId,
    };
    const invalid = await request("/migrations", { ...body, typo: true });
    expect(invalid.response.status).toBe(400);
    const plan = await request("/migrations", body);
    expect(plan.response.status).toBe(201);
    documentationGitMigrationSchema.parse(plan.data);
    const page = await request(`/migrations/${plan.data.planId}?offset=0&limit=1`);
    const model = await mcp("get_documentation_git_migration", {
      planId: plan.data.planId,
      offset: 0,
      limit: 1,
    });
    expect(page.data).toEqual(model.data);
    expect(page.data.files).toHaveLength(1);
    const cancellation = await request(
      `/migrations/${plan.data.planId}`,
      undefined,
      "DELETE",
    );
    const modelCancel = await mcp("cancel_documentation_git_migration", {
      planId: plan.data.planId,
    });
    expect(cancellation.data).toEqual(modelCancel.data);
    expect((await getDocsSettings(actor.teamId!)).source).toBe("editor");
  });
  it("admits the same setup PR over session REST and scoped OAuth MCP without exposing capture bodies or credentials", async () => {
    const userId = crypto.randomUUID(),
      sessionId = crypto.randomUUID(),
      sessionToken = crypto.randomUUID();
    await db.insert(authUser).values({
      id: userId,
      name: "Admin",
      email: `${userId}@test.invalid`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db
      .update(accounts)
      .set({ authUserId: userId })
      .where(eq(accounts.id, actor.accountId!));
    await db.insert(authSession).values({
      id: sessionId,
      userId,
      token: sessionToken,
      expiresAt: new Date(Date.now() + 3600000),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const past = new Date(Date.now() - 10000),
      clientId = crypto.randomUUID();
    await db
      .update(teamMembers)
      .set({ createdAt: past })
      .where(eq(teamMembers.teamId, actor.teamId!));
    await db
      .insert(authOAuthClient)
      .values({ id: crypto.randomUUID(), clientId, redirectUris: [] });
    await db.insert(authOAuthConsent).values({
      id: crypto.randomUUID(),
      clientId,
      userId,
      referenceId: actor.teamId!,
      scopes: ["documentation:manage", "documentation:publish"],
      createdAt: past,
      updatedAt: past,
    });
    await saveDocumentation(actor.teamId!, null, {
      title: "Private capture",
      markdown: "Do not expose this in admission status.",
    });
    const setupId = await setup(),
      settings = await getDocsSettings(actor.teamId!);
    const plan = (
      await request("/migrations", {
        setupId,
        installationId: 7,
        repositoryId: 9,
        branch: "trunk",
        directory: "docs",
        expectedDocsDraftVersion: settings.draftVersion,
        expectedPublicationId: settings.activePublicationId,
      })
    ).data;
    vi.spyOn(gitApp.DocsGitHubApp.prototype, "installation").mockResolvedValue({
      id: 7,
      app_id: 42,
      suspended_at: null,
      permissions: { contents: "write", pull_requests: "write" },
    });
    const body = {
      setupId,
      planHash: plan.planHash,
      expectedDocsDraftVersion: plan.docsDraftVersion,
      expectedPublicationId: plan.activePublicationId,
      acknowledgeExport: true,
      initializeEmptyRepository: false,
      idempotencyKey: "reviewed-setup",
    };
    const headers = { cookie: `better-auth.session_token=${sessionToken}` };
    expect(
      (
        await request(
          `/migrations/${plan.planId}/pr`,
          { ...body, typo: true },
          "POST",
          headers,
        )
      ).response.status,
    ).toBe(400);
    const rest = await request(`/migrations/${plan.planId}/pr`, body, "POST", headers);
    expect(rest.response.status).toBe(202);
    documentationGitMigrationPrSchema.parse(rest.data);
    expect(rest.response.headers.get("cache-control")).toBe("private, no-store");
    const now = Math.floor(Date.now() / 1000);
    // This harness replaces middleware: only credential-reference parity is
    // exercised here; real bearer signature verification has separate tests.
    const bearer = `header.${Buffer.from(
      JSON.stringify({
        sub: userId,
        client_id: clientId,
        team_id: actor.teamId,
        sid: sessionId,
        iat: now,
        exp: now + 3600,
      }),
    ).toString("base64url")}.verified-signature`;
    const model = await mcp(
      "create_documentation_git_migration_pr",
      { planId: plan.planId, ...body },
      {},
      { token: bearer, clientId },
    );
    expect(model.data).toEqual(rest.data);
    expect(JSON.stringify(rest.data)).not.toMatch(
      /Do not expose|sessionToken|actorCredential|privateKey/,
    );
    expect(JSON.stringify(model.data)).not.toContain(sessionToken);
    expect(JSON.stringify(model.data)).not.toContain(bearer);
    expect((await getDocsSettings(actor.teamId!)).source).toBe("editor");
    const denied = await mcp(
      "create_documentation_git_migration_pr",
      { planId: plan.planId, ...body },
      { authKind: "api_key" },
    );
    expect(denied.data).toMatchObject({ code: "GITHUB_PUBLISHER_REVOKED" });
  });
  it("MCP finalization requires an interactive original account, and API keys cannot manage setup or read private plans", async () => {
    const denied = await mcp("activate_documentation_git_migration", {
      planId: "not-a-plan",
      commitSha: "a".repeat(40),
      planHash: "b".repeat(64),
      expectedDocsDraftVersion: 1,
      expectedPublicationId: null,
      idempotencyKey: "once",
      consent: {
        publishSelectedDocsPublicly: true,
        automaticallyPublishFuturePushes: true,
        delegateToWorkspacePublishers: true,
      },
    });
    expect(denied.data.code).toBe("GITHUB_USER_AUTH_REQUIRED");
    expect(denied.result.isError).toBe(true);
    const key = await mcp(
      "get_documentation_git_migration",
      { planId: "not-a-plan" },
      { authKind: "api_key", account: null },
    );
    expect(key.data.code).toBe("GITHUB_USER_AUTH_REQUIRED");
    actor = { ...actor, authKind: "apikey", accountId: undefined };
    const http = await request("/setup", {});
    expect(http.response.status).toBe(403);
  });
  it("requires browser consent for capability changes over REST and MCP and validates strict consent fields", async () => {
    const body = {
      setupId: "proof",
      expectedConnectionGeneration: 1,
      expectedGrantVersion: 1,
      idempotencyKey: "grant-once",
      consent: { delegatePullRequests: true, delegateDirectCommits: false },
    };
    const invalid = await request("/capabilities", {
      ...body,
      consent: { ...body.consent, implicitPermission: true },
    });
    expect(invalid.response.status).toBe(400);
    actor = { ...actor, authKind: "oauth" };
    const http = await request("/capabilities", body);
    const model = await mcp("grant_documentation_github_capabilities", body);
    expect(http.response.status).toBe(403);
    expect(http.data.code).toBe("GITHUB_USER_AUTH_REQUIRED");
    expect(model.data).toEqual(http.data);
    expect(model.result.isError).toBe(true);
    actor = { ...actor, authKind: "apikey" };
    expect((await request("/capabilities", body)).response.status).toBe(403);
  });
});
