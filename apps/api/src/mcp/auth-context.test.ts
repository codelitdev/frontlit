import { describe, expect, it } from "vitest";
import { createFrontLitMcpAuthInfo } from "./auth-context";

describe("FrontLit MCP auth context", () => {
  it("projects OAuth as an account-wide principal with no team", () => {
    const auth = createFrontLitMcpAuthInfo({
      authKind: "oauth",
      oauthToken: "oauth-token",
      clientId: "oauth-client",
      scopes: ["pages:read"],
      account: { id: "account-1", email: "owner@example.com" },
    });

    expect(auth).toMatchObject({
      token: "oauth-token",
      clientId: "oauth-client",
      scopes: ["pages:read"],
      extra: {
        authKind: "oauth",
        accountId: "account-1",
        account: { id: "account-1" },
      },
    });
    // The tool registry resolves the team per call.
    expect(auth?.extra.teamId).toBeUndefined();
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
