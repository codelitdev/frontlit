import { describe, expect, it } from "vitest";
import { createFrontLitMcpAuthInfo } from "./auth-context";

describe("FrontLit MCP auth context", () => {
    it("keeps tenant identity separate from OAuth client identity", () => {
        const auth = createFrontLitMcpAuthInfo({
            authKind: "oauth",
            oauthToken: "oauth-token",
            clientId: "oauth-client",
            scopes: ["pages:read"],
            teamId: "team-1",
            account: { id: "account-1", email: "owner@example.com" },
        });

        expect(auth).toMatchObject({
            token: "oauth-token",
            clientId: "oauth-client",
            scopes: ["pages:read"],
            extra: {
                authKind: "oauth",
                teamId: "team-1",
                account: { id: "account-1" },
            },
        });
        expect(auth?.clientId).not.toBe(auth?.extra.teamId);
    });

    it("never places the submitted API-key secret in AuthInfo", () => {
        const auth = createFrontLitMcpAuthInfo({
            authKind: "apikey",
            apiKeyId: "key-public",
            apikey: "fl_live_secret",
            teamId: "team-1",
        });

        expect(auth).toMatchObject({
            token: "key-public",
            clientId: "api-key:key-public",
            extra: {
                authKind: "api_key",
                teamId: "team-1",
            },
        });
        expect(JSON.stringify(auth)).not.toContain("fl_live_secret");
    });
});
