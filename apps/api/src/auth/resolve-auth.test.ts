import { describe, expect, it, vi } from "vitest";
import type { AuthenticationResult } from "@codelitdev/oauth-server-kit";

const mocks = vi.hoisted(() => ({
    verifyBearerToken: vi.fn(),
    ensureAccountForBetterAuthUserId: vi.fn(),
}));

vi.mock("../account/queries", () => ({
    ensureFrontLitAccountForBetterAuthUserId:
        mocks.ensureAccountForBetterAuthUserId,
    ensureFrontLitAccountForUser: vi.fn(),
}));
vi.mock("../apikey/queries", () => ({ getApiKeyBySecret: vi.fn() }));
vi.mock("../team/queries", () => ({ getTeamMembership: vi.fn() }));
vi.mock("./better-auth", () => ({
    auth: { api: { getSession: vi.fn(async () => null) } },
    authIssuer: "https://frontlit.test/api/auth",
    mcpResourceUrl: "https://frontlit.test/mcp",
    validOAuthAudiences: ["https://frontlit.test", "https://frontlit.test/mcp"],
    oauthResourceClient: {
        getActions: () => ({ verifyBearerToken: mocks.verifyBearerToken }),
    },
}));
vi.mock("better-auth/node", () => ({
    fromNodeHeaders: vi.fn((headers) => headers),
}));

import { resolveAuth, type AuthDependencies } from "./resolve-auth.js";

const account = {
    id: "account-1",
    authUserId: "auth-user-1",
    email: "owner@example.com",
    createdAt: new Date(),
    updatedAt: new Date(),
};
const oauthIdentity = {
    method: "oauth" as const,
    issuer: "https://frontlit.test/api/auth",
    subject: "auth-user-1",
    clientId: "mcp-client",
    scopes: ["pages:read", "themes:write"],
    audiences: ["https://frontlit.test/mcp"],
};
const sessionIdentity = {
    method: "session" as const,
    issuer: "https://frontlit.test/api/auth",
    subject: "auth-user-1",
    email: "owner@example.com",
    name: "Owner",
    scopes: [] as [],
};

function dependencies(
    overrides: Partial<AuthDependencies> = {},
): AuthDependencies {
    return {
        getApiKeyBySecret: vi.fn(async () => ({
            id: "key-1",
            teamId: "team-internal-1",
            keyHash: "hash",
            keyPrefix: "fl_live_1234",
            name: "Default",
            createdAt: new Date(),
        })),
        resolveSession: vi.fn(async (): Promise<AuthenticationResult> => ({
            status: "missing",
        })),
        authenticateBearer: vi.fn(async () => null),
        ensureAccountForBetterAuthUserId: vi.fn(async () => account),
        ensureAccountForUser: vi.fn(async () => account),
        getTeamMembership: vi.fn(async () => null),
        ...overrides,
    };
}

describe("FrontLit auth composition", () => {
    it("verifies bearer tokens through Better Auth's resource client", async () => {
        mocks.verifyBearerToken.mockResolvedValueOnce({
            sub: "auth-user-1",
            azp: "mcp-client",
            aud: "https://frontlit.test/mcp",
            scope: "pages:read themes:write",
            team_id: "team-internal-1",
        });
        mocks.ensureAccountForBetterAuthUserId.mockResolvedValueOnce(account);

        await expect(
            resolveAuth({ authorization: "Bearer valid" }),
        ).resolves.toMatchObject({
            status: "authenticated",
            kind: "oauth",
            clientId: "mcp-client",
            scopes: ["pages:read", "themes:write"],
        });
        expect(mocks.verifyBearerToken).toHaveBeenCalledWith("valid", {
            verifyOptions: {
                issuer: "https://frontlit.test/api/auth",
                audience: [
                    "https://frontlit.test",
                    "https://frontlit.test/mcp",
                ],
            },
            resourceMetadataMappings: {
                mcp: "https://frontlit.test/mcp",
            },
        });
    });

    it("fails closed without falling back from an invalid explicit bearer", async () => {
        const deps = dependencies();
        await expect(
            resolveAuth(
                {
                    authorization: "Bearer expired",
                    apiKeyHeader: "fl_live_valid",
                },
                deps,
            ),
        ).resolves.toEqual({ status: "invalid_token" });
        expect(deps.getApiKeyBySecret).not.toHaveBeenCalled();
        expect(deps.resolveSession).not.toHaveBeenCalled();
    });

    it("keeps FrontLit API-key precedence and projection product-owned", async () => {
        const deps = dependencies({
            resolveSession: vi.fn(async (): Promise<AuthenticationResult> => ({
                status: "authenticated",
                identity: sessionIdentity,
            })),
        });
        await expect(
            resolveAuth(
                {
                    apiKeyHeader: "fl_live_valid",
                    headers: { cookie: "better-auth.session_token=s" },
                },
                deps,
            ),
        ).resolves.toMatchObject({
            status: "authenticated",
            kind: "apikey",
            apiKeyId: "key-1",
            teamId: "team-internal-1",
        });
        expect(deps.resolveSession).not.toHaveBeenCalled();
    });

    it("maps neutral OAuth identity and retains a team claim only with live membership", async () => {
        const deps = dependencies({
            authenticateBearer: vi.fn(async () => ({
                identity: oauthIdentity,
                teamId: "team-internal-1",
            })),
            getTeamMembership: vi.fn(async () => ({ role: "owner" })),
        });
        await expect(
            resolveAuth({ authorization: "Bearer valid" }, deps),
        ).resolves.toMatchObject({
            status: "authenticated",
            kind: "oauth",
            accountId: "account-1",
            oauthToken: "valid",
            teamId: "team-internal-1",
            scopes: ["pages:read", "themes:write"],
        });

        vi.mocked(deps.getTeamMembership).mockResolvedValueOnce(null);
        const revoked = await resolveAuth(
            { authorization: ["Bearer valid"] },
            deps,
        );
        expect(revoked).toMatchObject({
            status: "authenticated",
            kind: "oauth",
        });
        expect(revoked).toHaveProperty("teamId", undefined);
    });

    it("rejects OAuth subjects that cannot map to a FrontLit account", async () => {
        const deps = dependencies({
            authenticateBearer: vi.fn(async () => ({
                identity: oauthIdentity,
            })),
            ensureAccountForBetterAuthUserId: vi.fn(async () => null),
        });
        await expect(
            resolveAuth({ authorization: "Bearer valid" }, deps),
        ).resolves.toEqual({ status: "unauthorized" });
    });

    it("maps a valid browser session and preserves unavailable status", async () => {
        const deps = dependencies({
            resolveSession: vi.fn(async (): Promise<AuthenticationResult> => ({
                status: "authenticated",
                identity: sessionIdentity,
            })),
        });
        await expect(
            resolveAuth({ headers: { cookie: "session=s" } }, deps),
        ).resolves.toMatchObject({
            status: "authenticated",
            kind: "session",
            accountId: "account-1",
        });
        expect(deps.ensureAccountForUser).toHaveBeenCalledWith({
            id: "auth-user-1",
            email: "owner@example.com",
            name: "Owner",
        });

        vi.mocked(deps.resolveSession).mockResolvedValueOnce({
            status: "unavailable",
            cause: new Error("database offline"),
        });
        await expect(
            resolveAuth({ headers: { cookie: "session=s" } }, deps),
        ).resolves.toEqual({ status: "unavailable" });
    });

    it("returns missing when no supported credential authenticates", async () => {
        await expect(resolveAuth({}, dependencies())).resolves.toEqual({
            status: "missing",
        });
    });
});
