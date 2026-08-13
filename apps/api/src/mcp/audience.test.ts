import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    verifyBearerToken: vi.fn(),
    ensureAccount: vi.fn(),
}));

vi.mock("../db/client", () => ({
    db: {},
    pool: {},
    sqlTransactionsEnabled: false,
}));
vi.mock("../auth/better-auth", () => ({
    auth: {
        options: { baseURL: "http://localhost:4000", basePath: "/api/auth" },
    },
    mcpResourceUrl: "http://localhost:4000/mcp",
    mcpProtectedResourceMetadataUrl:
        "http://localhost:4000/.well-known/oauth-protected-resource/mcp",
    authBaseUrl: "http://localhost:4000",
    authIssuer: "http://localhost:4000/api/auth",
    validOAuthAudiences: ["http://localhost:4000", "http://localhost:4000/mcp"],
    oauthResourceClient: {
        getActions: () => ({ verifyBearerToken: mocks.verifyBearerToken }),
    },
    webClientUrl: "http://localhost:3000",
}));
vi.mock("../account/queries", () => ({
    ensureFrontLitAccountForBetterAuthUserId: mocks.ensureAccount,
    ensureFrontLitAccountForUser: vi.fn(),
}));
vi.mock("../apikey/queries", () => ({ getApiKeyBySecret: vi.fn() }));
vi.mock("../team/queries", () => ({ getTeamMembership: vi.fn() }));

import { mcpAuth } from "../auth/middleware";

const listening: Array<{ close(): Promise<void> }> = [];

async function listenMcp() {
    const app = express();
    app.post("/mcp", mcpAuth, (_req, res) => {
        res.status(200).json({ ok: true });
    });
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;
    const instance = {
        origin: `http://127.0.0.1:${port}`,
        close: () =>
            new Promise<void>((resolve, reject) =>
                server.close((error) => (error ? reject(error) : resolve())),
            ),
    };
    listening.push(instance);
    return instance;
}

afterEach(async () => {
    await Promise.allSettled(listening.splice(0).map((item) => item.close()));
    mocks.verifyBearerToken.mockReset();
    mocks.ensureAccount.mockReset();
});

describe("MCP audience at /mcp", () => {
    it("rejects a REST-audience token on the shipped mcpAuth path", async () => {
        mocks.verifyBearerToken.mockResolvedValue({
            sub: "auth-user-1",
            azp: "mcp-client",
            aud: "http://localhost:4000",
            scope: "pages:read",
        });
        const { origin } = await listenMcp();
        const response = await fetch(`${origin}/mcp`, {
            method: "POST",
            headers: { authorization: "Bearer rest-aud-token" },
        });
        expect(response.status).toBe(401);
        await expect(response.json()).resolves.toMatchObject({
            error: "invalid_token",
        });
        expect(mocks.verifyBearerToken).toHaveBeenCalledWith(
            "rest-aud-token",
            expect.objectContaining({
                verifyOptions: expect.objectContaining({
                    audience: ["http://localhost:4000/mcp"],
                }),
            }),
        );
        expect(mocks.ensureAccount).not.toHaveBeenCalled();
    });

    it("accepts a token whose audience is the MCP resource", async () => {
        mocks.verifyBearerToken.mockResolvedValue({
            sub: "auth-user-1",
            azp: "mcp-client",
            aud: "http://localhost:4000/mcp",
            scope: "pages:read",
            team_id: "team-1",
        });
        mocks.ensureAccount.mockResolvedValue({
            id: "account-1",
            authUserId: "auth-user-1",
            email: "owner@example.com",
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        const { origin } = await listenMcp();
        const response = await fetch(`${origin}/mcp`, {
            method: "POST",
            headers: { authorization: "Bearer mcp-aud-token" },
        });
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ ok: true });
    });
});
