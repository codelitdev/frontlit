import { describe, expect, it, vi } from "vitest";

vi.mock("../account/queries", () => ({
    ensureFrontLitAccountForBetterAuthUserId: vi.fn(),
    ensureFrontLitAccountForUser: vi.fn(),
}));
vi.mock("../apikey/queries", () => ({
    getApiKeyBySecret: vi.fn(),
}));
vi.mock("../team/queries", () => ({
    getTeamMembership: vi.fn(),
}));
vi.mock("./better-auth", () => ({
    auth: { api: { getSession: vi.fn(async () => null) } },
    authIssuer: "https://frontlit.test/api/auth",
    mcpResourceUrl: "https://frontlit.test/mcp",
    validOAuthAudiences: [
        "https://frontlit.test",
        "https://frontlit.test/mcp",
    ],
    oauthResourceClient: {
        getActions: () => ({ verifyAccessToken: vi.fn(async () => null) }),
    },
}));
vi.mock("better-auth/node", () => ({
    fromNodeHeaders: vi.fn((headers) => headers),
}));

import {
    resolveAuth,
    type AuthDependencies,
} from "./resolve-auth";

const account = {
    id: "account-1",
    authUserId: "auth-user-1",
    email: "owner@example.com",
    createdAt: new Date(),
    updatedAt: new Date(),
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
        getBetterAuthSession: vi.fn(async () => null),
        verifyBetterAuthBearerToken: vi.fn(async () => null),
        ensureAccountForBetterAuthUserId: vi.fn(async () => account),
        ensureAccountForUser: vi.fn(async () => account),
        getTeamMembership: vi.fn(async () => null),
        ...overrides,
    };
}

describe("resolveAuth", () => {
    it("does not fall back when an explicitly supplied bearer token is invalid", async () => {
        const deps = dependencies({
            verifyBetterAuthBearerToken: vi.fn(async () => null),
        });
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
    });

    it("prefers an explicit API key over an ambient browser session", async () => {
        const deps = dependencies({
            getBetterAuthSession: vi.fn(async () => ({
                user: {
                    id: "auth-user-1",
                    email: "owner@example.com",
                },
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
            teamId: "team-internal-1",
        });
        expect(deps.getBetterAuthSession).not.toHaveBeenCalled();
    });

    it("retains an OAuth team claim only while membership is live", async () => {
        const deps = dependencies({
            verifyBetterAuthBearerToken: vi.fn(async () => ({
                sub: "auth-user-1",
                azp: "mcp-client",
                scope: "pages:read themes:write",
                team_id: "team-internal-1",
            })),
            getTeamMembership: vi.fn(async () => ({ role: "owner" })),
        });
        await expect(
            resolveAuth({ authorization: "Bearer valid" }, deps),
        ).resolves.toMatchObject({
            status: "authenticated",
            kind: "oauth",
            teamId: "team-internal-1",
            scopes: ["pages:read", "themes:write"],
        });

        vi.mocked(deps.getTeamMembership).mockResolvedValueOnce(null);
        const revoked = await resolveAuth(
            { authorization: "Bearer valid" },
            deps,
        );
        expect(revoked).toMatchObject({
            status: "authenticated",
            kind: "oauth",
        });
        expect((revoked as any).teamId).toBeUndefined();
    });

    it("resolves signed-in web sessions through the same account identity", async () => {
        const deps = dependencies({
            getBetterAuthSession: vi.fn(async () => ({
                user: {
                    id: "auth-user-1",
                    email: "owner@example.com",
                    name: "Owner",
                },
            })),
        });
        await expect(
            resolveAuth(
                { headers: { cookie: "better-auth.session_token=s" } },
                deps,
            ),
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
    });
});
