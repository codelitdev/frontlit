import express from "express";
import { documentationGitSourceSchema } from "@frontlit/api-contract";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { makeTestDb, seedTeam, type TestDb } from "../../test/db";
import {
  accounts,
  authUser,
  authOAuthClient,
  authOAuthConsent,
  teamMembers,
  documentationGitSetups,
  documentationGitMigrationPrs,
} from "../../db/schema";
import type { AuthzContext } from "../../auth/authorize";
import * as github from "./app";

vi.mock("../../db/client", async () => ({ db: await makeTestDb() }));
// Only the remote GitHub boundary is replaced. Authentication, JWKS signature
// verification, team resolution, operation policy and MCP routing are real.
vi.mock("./setup", async (original) => ({
  ...(await original<typeof import("./setup")>()),
  verifySetupRepository: vi.fn(),
}));

describe("signed OAuth documentation setup transports", () => {
  let server: Server, origin: string, db: TestDb;
  let auth: typeof import("../../auth/better-auth")["auth"];
  const config: github.GitHubAppConfig = {
    appId: "42",
    appSlug: "test",
    clientId: "test",
    clientSecret: "fixture",
    privateKey: "unused",
    webhookSecret: "fixture",
    webOrigin: "http://localhost",
    callbackUrl: "http://localhost/integrations/github/callback",
  };
  beforeAll(async () => {
    const app = express();
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    vi.stubEnv("API_PUBLIC_URL", origin);
    vi.stubEnv("WEB_CLIENT", origin);
    db = (await import("../../db/client.js")).db as unknown as TestDb;
    auth = (await import("../../auth/better-auth.js")).auth;
    const { toNodeHandler } = await import("better-auth/node");
    app.all("/api/auth/*", toNodeHandler(auth));
    app.use((await import("../../mcp/routes.js")).default as unknown as express.Router);
    app.use(express.json());
    app.use((await import("./routes.js")).default as unknown as express.Router);
    vi.spyOn(github, "getDocsGitHubAppConfig").mockReturnValue(config);
    vi.spyOn(github.DocsGitHubApp.prototype, "installation").mockResolvedValue({
      id: 7,
      permissions: { contents: "write", pull_requests: "write" },
    } as any);
  });
  afterAll(async () => {
    if (server?.listening)
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    vi.unstubAllEnvs();
  });
  async function fixture() {
    const { team, account } = await seedTeam(db);
    const userId = crypto.randomUUID(),
      clientId = crypto.randomUUID();
    const past = new Date(Date.now() - 60000);
    await db.insert(authUser).values({
      id: userId,
      email: account.email,
      name: "OAuth test administrator",
      emailVerified: true,
      createdAt: past,
      updatedAt: past,
    });
    await db
      .update(accounts)
      .set({ authUserId: userId })
      .where(eq(accounts.id, account.id));
    await db
      .update(teamMembers)
      .set({ createdAt: past })
      .where(eq(teamMembers.accountId, account.id));
    await db
      .insert(authOAuthClient)
      .values({ id: crypto.randomUUID(), clientId, redirectUris: [] });
    const [consent] = await db
      .insert(authOAuthConsent)
      .values({
        id: crypto.randomUUID(),
        userId,
        clientId,
        referenceId: team.id,
        scopes: ["documentation:read", "documentation:manage", "documentation:publish"],
        createdAt: past,
        updatedAt: past,
      })
      .returning();
    const actor: AuthzContext = {
      authKind: "session",
      teamId: team.id,
      accountId: account.id,
      isOwner: true,
      permissions: [],
      scopes: [],
      audiences: [],
    };
    const [setup] = await db
      .insert(documentationGitSetups)
      .values({
        teamId: team.id,
        actorAccountId: account.id,
        stateHash: crypto.randomUUID(),
        purpose: "connect",
        returnPath: "/settings/content?tab=source",
        status: "authorized",
        encryptedUserToken: "fixture",
        githubUserId: "123",
        expiresAt: new Date(Date.now() + 600000),
      })
      .returning();
    const { verifySetupRepository, authorizedSetup } = await import("./setup.js");
    const repository = {
      id: 9,
      owner: { id: 8, login: "org" },
      name: "docs",
      private: true,
      default_branch: "main",
    };
    vi.mocked(verifySetupRepository).mockImplementation(
      async (teamId, setupId, requestingActor) =>
        ({
          setup: await authorizedSetup(teamId, setupId, requestingActor),
          repository,
          installationToken: "fixture",
        }) as any,
    );
    const { saveDocumentation, getDocsSettings } = await import("../authoring.js");
    await saveDocumentation(team.id, null, {
      title: "Private draft",
      markdown: "Secret capture body",
    });
    const settings = await getDocsSettings(team.id);
    const { planGitMigration } = await import("./migrations.js");
    const plan = await planGitMigration(
      team.id,
      actor,
      {
        setupId: setup.setupId,
        installationId: 7,
        repositoryId: 9,
        branch: "main",
        directory: "docs",
        expectedDocsDraftVersion: settings.draftVersion,
        expectedPublicationId: null,
      },
      config,
      { branchHead: vi.fn().mockResolvedValue("a".repeat(40)) } as any,
    );
    const body = {
      setupId: setup.setupId,
      planHash: plan.planHash,
      expectedDocsDraftVersion: plan.docsDraftVersion,
      expectedPublicationId: null,
      acknowledgeExport: true,
      initializeEmptyRepository: false,
      idempotencyKey: crypto.randomUUID(),
    };
    async function token(audience: string, overrides: Record<string, unknown> = {}) {
      const now = Math.floor(Date.now() / 1000);
      // Test token is minted by the real server-only signer, not an interactive
      // authorization-code flow. The resource verifier fetches real local JWKS.
      return (
        await auth.api.signJWT({
          body: {
            payload: {
              sub: userId,
              client_id: clientId,
              team_id: team.id,
              scope: consent.scopes.join(" "),
              iss: `${origin}/api/auth`,
              aud: audience,
              iat: now,
              exp: now + 600,
              ...overrides,
            },
          },
        })
      ).token;
    }
    async function rest(bearer: string) {
      const response = await fetch(
        `${origin}/content/documentation/github/migrations/${plan.planId}/pr`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${bearer}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );
      return { status: response.status, body: await response.json() };
    }
    return { team, plan, body, consent, clientId, token, rest };
  }
  it("verifies signatures, issuer, expiry and REST audience before admitting a setup PR", async () => {
    const f = await fixture();
    const bearer = await f.token(origin);
    const parts = bearer.split(".");
    parts[1] = Buffer.from(JSON.stringify({ sub: "forged" })).toString("base64url");
    for (const denied of [
      parts.join("."),
      await f.token(`${origin}/mcp`),
      await f.token(origin, { iss: "https://wrong-issuer.invalid" }),
      await f.token(origin, { exp: Math.floor(Date.now() / 1000) - 600 }),
    ]) {
      expect(await f.rest(denied)).toMatchObject({
        status: 401,
        body: { error: "invalid_token" },
      });
    }
    expect(
      await db.query.documentationGitMigrationPrs.findFirst({
        where: eq(documentationGitMigrationPrs.planId, f.plan.planId),
      }),
    ).toBeUndefined();
    for (const [token, expectedPlan] of [
      [bearer, f.plan.planId],
      [await f.token(origin, { scope: "documentation:read" }), null],
    ] as const) {
      const response = await fetch(`${origin}/content/documentation/github`, {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.status).toBe(200);
      const body = documentationGitSourceSchema.parse(await response.json());
      expect(body.pendingMigrationId).toBe(expectedPlan);
      expect(JSON.stringify(body)).not.toContain("Secret capture body");
    }
    const accepted = await f.rest(bearer);
    expect(accepted).toMatchObject({ status: 202, body: { status: "queued" } });
    expect(JSON.stringify(accepted)).not.toContain(bearer);
    expect(JSON.stringify(accepted)).not.toContain("Secret capture body");
  });
  it("routes a signed MCP token through the actual SDK and shares idempotent setup admission with REST", async () => {
    const f = await fixture();
    const rest = await f.rest(await f.token(origin));
    expect(rest.status).toBe(202);
    const bearer = await f.token(`${origin}/mcp`);
    const client = new Client({ name: "documentation-oauth-smoke", version: "1" });
    try {
      await client.connect(
        new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
          requestInit: { headers: { authorization: `Bearer ${bearer}` } },
        }),
      );
      const result = await client.callTool({
        name: "create_documentation_git_migration_pr",
        arguments: { planId: f.plan.planId, ...f.body },
      });
      expect(result.isError).not.toBe(true);
      const output = JSON.parse(
        (result.content as any[]).find((entry) => entry.type === "text").text,
      );
      expect(output).toEqual(rest.body);
      expect(JSON.stringify(result)).not.toContain(bearer);
    } finally {
      await client.close();
    }
  });
  it("rejects insufficient scopes and revoked consent without admitting remote work", async () => {
    const f = await fixture();
    expect(
      (await f.rest(await f.token(origin, { scope: "documentation:manage" }))).status,
    ).toBe(403);
    const wrongAudience = await fetch(`${origin}/mcp`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${await f.token(origin)}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "invalid-audience", version: "1" },
        },
      }),
    });
    expect(wrongAudience.status).toBe(401);
    expect(wrongAudience.headers.get("www-authenticate")).toContain(
      "resource_metadata=",
    );
    const client = new Client({
      name: "documentation-insufficient-scope",
      version: "1",
    });
    try {
      await client.connect(
        new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
          requestInit: {
            headers: {
              authorization: `Bearer ${await f.token(`${origin}/mcp`, {
                scope: "documentation:manage",
              })}`,
            },
          },
        }),
      );
      const result = await client.callTool({
        name: "create_documentation_git_migration_pr",
        arguments: { planId: f.plan.planId, ...f.body },
      });
      expect(result.isError).toBe(true);
      expect(
        JSON.parse(
          (result.content as any[]).find((entry) => entry.type === "text").text,
        ),
      ).toMatchObject({ code: "GITHUB_PUBLISHER_REVOKED" });
    } finally {
      await client.close();
    }
    await db.delete(authOAuthConsent).where(eq(authOAuthConsent.id, f.consent.id));
    expect(await f.rest(await f.token(origin))).toMatchObject({
      status: 403,
      body: { code: "GITHUB_PUBLISHER_REVOKED" },
    });
    expect(
      await db.query.documentationGitMigrationPrs.findFirst({
        where: eq(documentationGitMigrationPrs.planId, f.plan.planId),
      }),
    ).toBeUndefined();
  });
});
