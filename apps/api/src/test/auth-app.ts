import type { AddressInfo } from "node:net";
import { createApp } from "../app";
import type { AuthResult } from "../auth/resolve-auth";
const authBaseUrl = "http://localhost:4000";
const mcpResourceUrl = "http://localhost:4000/mcp";

export type TestPrincipal = {
  kind: "session" | "oauth" | "apikey";
  accountId?: string;
  email?: string;
  teamId?: string;
  scopes?: string[];
  audiences?: string[];
  oauthTeamInvalid?: boolean;
  claimedTeamId?: string;
  sessionAuthenticatedAt?: Date;
  apiKeyId?: string;
  oauthIssuedAt?: Date;
};

export function principalFromHeader(
  header: string | undefined,
): AuthResult | { status: "missing" } {
  if (!header) return { status: "missing" };
  const principal = JSON.parse(header) as TestPrincipal;
  const account = principal.accountId
    ? {
        id: principal.accountId,
        authUserId: null,
        email: principal.email ?? "user@example.com",
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    : null;
  if (principal.kind === "session" && account) {
    return {
      status: "authenticated",
      kind: "session",
      identity: {
        method: "session",
        issuer: "https://frontlit.test/api/auth",
        subject: account.id,
        email: account.email,
        scopes: [],
      },
      account,
      accountId: account.id,
      scopes: ["web"],
      sessionAuthenticatedAt: principal.sessionAuthenticatedAt
        ? new Date(principal.sessionAuthenticatedAt)
        : undefined,
    };
  }
  if (principal.kind === "oauth" && account) {
    return {
      status: "authenticated",
      kind: "oauth",
      identity: {
        method: "oauth",
        issuer: "https://frontlit.test/api/auth",
        subject: account.id,
        clientId: "test-client",
        scopes: principal.scopes ?? [],
        audiences: principal.audiences?.filter(Boolean) ?? ["http://localhost:4000"],
      },
      account,
      accountId: account.id,
      oauthToken: "test-oauth",
      clientId: "test-client",
      scopes: principal.scopes ?? [],
      teamId: principal.oauthTeamInvalid ? undefined : principal.teamId,
      claimedTeamId: principal.claimedTeamId ?? principal.teamId,
      oauthTeamInvalid: principal.oauthTeamInvalid,
      oauthIssuedAt: principal.oauthIssuedAt
        ? new Date(principal.oauthIssuedAt)
        : undefined,
      audiences: principal.audiences?.filter(Boolean) ?? ["http://localhost:4000"],
    };
  }
  if (principal.kind === "apikey" && principal.teamId) {
    return {
      status: "authenticated",
      kind: "apikey",
      account: null,
      apiKeyId: principal.apiKeyId ?? "key-1",
      teamId: principal.teamId,
    };
  }
  return { status: "missing" };
}

export async function listenApp() {
  const app = createApp();
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}

export function authHeaders(principal: TestPrincipal, publicTeamId?: string) {
  return {
    "content-type": "application/json",
    origin: "http://localhost:3000",
    "x-frontlit-origin": "http://localhost:3000",
    "x-test-principal": JSON.stringify({
      ...principal,
      sessionAuthenticatedAt: principal.sessionAuthenticatedAt
        ? principal.sessionAuthenticatedAt.toISOString()
        : undefined,
      oauthIssuedAt:
        principal.kind === "oauth"
          ? (principal.oauthIssuedAt ?? new Date()).toISOString()
          : undefined,
    }),
    ...(publicTeamId ? { "x-frontlit-team-id": publicTeamId } : {}),
  };
}

export { authBaseUrl, mcpResourceUrl };
