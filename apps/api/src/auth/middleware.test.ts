import type { AddressInfo } from "node:net";
import express from "express";
import { describe, expect, it, vi } from "vitest";
import type { AuthResult } from "./resolve-auth.js";

vi.mock("./better-auth", () => ({
    mcpProtectedResourceMetadataUrl:
        "https://frontlit.test/.well-known/oauth-protected-resource/mcp",
}));

import { createAuthMiddleware } from "./middleware.js";

async function requestFor(result: AuthResult | Error) {
    const resolver = vi.fn(async () => {
        if (result instanceof Error) throw result;
        return result;
    });
    const app = express();
    app.get(
        "/protected",
        createAuthMiddleware("mcp", resolver),
        (request, response) => {
            const productRequest = request as any;
            response.json({
                auth: request.auth,
                authKind: productRequest.authKind,
                accountId: productRequest.accountId,
                teamId: productRequest.teamId,
                clientId: productRequest.clientId,
                scopes: productRequest.scopes,
                apiKey: productRequest.apikey,
            });
        },
    );
    app.use(
        (
            error: Error,
            _request: express.Request,
            response: express.Response,
            _next: express.NextFunction,
        ) => response.status(503).json({ error: error.message }),
    );
    const server = app.listen(0, "127.0.0.1");
    try {
        await new Promise<void>((resolve) => server.once("listening", resolve));
        const { port } = server.address() as AddressInfo;
        const response = await fetch(`http://127.0.0.1:${port}/protected`, {
            headers: { authorization: "Bearer token" },
        });
        return { response, resolver };
    } finally {
        await new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
        );
    }
}

const account = {
    id: "account-1",
    authUserId: "auth-user-1",
    email: "owner@example.com",
    createdAt: new Date(),
    updatedAt: new Date(),
};

describe("FrontLit auth middleware projection", () => {
    it("projects neutral OAuth identity and FrontLit-owned context", async () => {
        const identity = {
            method: "oauth" as const,
            issuer: "https://frontlit.test/api/auth",
            subject: "auth-user-1",
            clientId: "mcp-client",
            scopes: ["pages:read"],
            audiences: ["https://frontlit.test/mcp"],
        };
        const { response, resolver } = await requestFor({
            status: "authenticated",
            kind: "oauth",
            identity,
            account,
            accountId: account.id,
            clientId: identity.clientId,
            scopes: identity.scopes,
            teamId: "team-1",
        });
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            auth: identity,
            authKind: "oauth",
            accountId: "account-1",
            teamId: "team-1",
            clientId: "mcp-client",
            scopes: ["pages:read"],
        });
        expect(resolver).toHaveBeenCalledOnce();
    });

    it("keeps FrontLit API-key projection separate from req.auth", async () => {
        const { response } = await requestFor({
            status: "authenticated",
            kind: "apikey",
            account: null,
            apiKey: "fl_live_secret",
            teamId: "team-1",
        });
        const body = (await response.json()) as Record<string, unknown>;
        expect(body).toMatchObject({
            authKind: "apikey",
            teamId: "team-1",
            apiKey: "fl_live_secret",
        });
        expect(body.auth).toBeUndefined();
    });

    it("stops before the product handler on authentication errors", async () => {
        const { response } = await requestFor({ status: "invalid_token" });
        expect(response.status).toBe(401);
        await expect(response.json()).resolves.toMatchObject({
            error: "invalid_token",
        });
    });

    it("forwards product resolver failures to Express error handling", async () => {
        const { response } = await requestFor(
            new Error("database unavailable"),
        );
        expect(response.status).toBe(503);
        await expect(response.json()).resolves.toEqual({
            error: "database unavailable",
        });
    });
});
