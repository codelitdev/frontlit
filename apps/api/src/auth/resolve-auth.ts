import { fromNodeHeaders } from "better-auth/node";
import {
    verifyOAuthAccessToken,
    type AuthenticatedIdentity,
    type AuthenticationResult,
} from "@codelitdev/oauth-server-kit";
import { resolveBetterAuthSession } from "@codelitdev/oauth-server-kit/better-auth";
import {
    ensureFrontLitAccountForBetterAuthUserId,
    ensureFrontLitAccountForUser,
    type Account,
} from "../account/queries";
import { getApiKeyBySecret, type ApiKey } from "../apikey/queries";
import { getTeamMembership } from "../team/queries";
import {
    auth,
    authIssuer,
    mcpResourceUrl,
    oauthResourceClient,
    validOAuthAudiences,
} from "./better-auth";

export type AuthInput = {
    authorization?: unknown;
    apiKeyHeader?: unknown;
    bodyApiKey?: unknown;
    headers?: Record<string, string | string[] | undefined>;
};

export type AuthResult =
    | {
          status: "authenticated";
          kind: "oauth";
          identity: Extract<AuthenticatedIdentity, { method: "oauth" }>;
          account: Account;
          accountId: string;
          clientId: string;
          scopes: string[];
          teamId?: string;
      }
    | {
          status: "authenticated";
          kind: "session";
          identity: Extract<AuthenticatedIdentity, { method: "session" }>;
          account: Account;
          accountId: string;
          scopes: ["web"];
      }
    | {
          status: "authenticated";
          kind: "apikey";
          account: null;
          apiKey: string;
          teamId: string;
      }
    | { status: "invalid_token" }
    | { status: "unauthorized" }
    | { status: "missing" }
    | { status: "unavailable" };

export type AuthDependencies = {
    getApiKeyBySecret: (secret: string) => Promise<ApiKey | null>;
    resolveSession: (
        headers: Record<string, string | string[] | undefined>,
    ) => Promise<AuthenticationResult>;
    authenticateBearer: (token: string) => Promise<{
        identity: Extract<AuthenticatedIdentity, { method: "oauth" }>;
        teamId?: string;
    } | null>;
    ensureAccountForBetterAuthUserId: (
        userId: string,
    ) => Promise<Account | null>;
    ensureAccountForUser: (user: {
        id?: string;
        email: string;
        name?: string | null;
    }) => Promise<Account>;
    getTeamMembership: (
        teamId: string,
        accountId: string,
    ) => Promise<unknown | null>;
};

function headerValue(value: unknown): string | undefined {
    if (Array.isArray(value)) {
        return typeof value[0] === "string" ? value[0] : undefined;
    }
    return typeof value === "string" ? value : undefined;
}

function teamClaimFromVerifiedJwt(token: string): string | undefined {
    try {
        const parts = token.split(".");
        if (parts.length !== 3) return undefined;
        const payload = JSON.parse(
            Buffer.from(parts[1], "base64url").toString("utf8"),
        ) as Record<string, unknown>;
        return typeof payload.team_id === "string"
            ? payload.team_id
            : undefined;
    } catch {
        return undefined;
    }
}

const defaultDependencies: AuthDependencies = {
    getApiKeyBySecret,
    async resolveSession(headers) {
        return resolveBetterAuthSession(
            { auth, issuer: authIssuer },
            fromNodeHeaders(headers),
        );
    },
    async authenticateBearer(token) {
        const result = await verifyOAuthAccessToken(
            {
                oauthResourceClient,
                audiences: validOAuthAudiences,
                issuer: authIssuer,
                resourceMetadataMappings: { mcp: mcpResourceUrl },
            },
            token,
        );
        if (
            result.status !== "authenticated" ||
            result.identity.method !== "oauth"
        ) {
            return null;
        }
        return {
            identity: result.identity,
            teamId: teamClaimFromVerifiedJwt(token),
        };
    },
    ensureAccountForBetterAuthUserId: ensureFrontLitAccountForBetterAuthUserId,
    ensureAccountForUser: ensureFrontLitAccountForUser,
    getTeamMembership,
};

export async function resolveAuth(
    input: AuthInput,
    dependencies: AuthDependencies = defaultDependencies,
): Promise<AuthResult> {
    const authorization = headerValue(input.authorization);
    if (authorization) {
        const match = authorization.match(/^Bearer\s+(.+)$/i);
        if (match) {
            const authenticated = await dependencies.authenticateBearer(
                match[1],
            );
            if (!authenticated) return { status: "invalid_token" };
            const account = await dependencies.ensureAccountForBetterAuthUserId(
                authenticated.identity.subject,
            );
            if (!account) return { status: "unauthorized" };

            let teamId: string | undefined;
            if (
                authenticated.teamId &&
                (await dependencies.getTeamMembership(
                    authenticated.teamId,
                    account.id,
                ))
            ) {
                teamId = authenticated.teamId;
            }
            return {
                status: "authenticated",
                kind: "oauth",
                identity: authenticated.identity,
                account,
                accountId: account.id,
                clientId: authenticated.identity.clientId,
                scopes: authenticated.identity.scopes,
                teamId,
            };
        }
    }

    const submittedApiKey =
        headerValue(input.bodyApiKey) ?? headerValue(input.apiKeyHeader);
    if (submittedApiKey) {
        const apiKey = await dependencies.getApiKeyBySecret(submittedApiKey);
        if (!apiKey) return { status: "unauthorized" };
        return {
            status: "authenticated",
            kind: "apikey",
            account: null,
            apiKey: submittedApiKey,
            teamId: apiKey.teamId,
        };
    }

    if (input.headers) {
        const result = await dependencies.resolveSession(input.headers);
        if (result.status === "unavailable") return { status: "unavailable" };
        if (
            result.status === "authenticated" &&
            result.identity.method === "session"
        ) {
            const account = await dependencies.ensureAccountForUser({
                id: result.identity.subject,
                email: result.identity.email,
                name: result.identity.name,
            });
            return {
                status: "authenticated",
                kind: "session",
                identity: result.identity,
                account,
                accountId: account.id,
                scopes: ["web"],
            };
        }
    }
    return { status: "missing" };
}

export function sendAuthError(
    response: {
        setHeader(name: string, value: string): unknown;
        status(code: number): {
            json(body: unknown): unknown;
        };
    },
    result: AuthResult,
    resourceMetadataUrl?: string,
): boolean {
    if (result.status === "authenticated") return false;
    if (result.status === "unavailable") {
        response.status(503).json({ error: "authentication_unavailable" });
        return true;
    }
    if (resourceMetadataUrl) {
        response.setHeader(
            "WWW-Authenticate",
            `Bearer resource_metadata="${resourceMetadataUrl}"`,
        );
    }
    if (result.status === "invalid_token") {
        response.status(401).json({
            error: "invalid_token",
            error_description: "The access token is invalid or expired",
        });
        return true;
    }
    if (result.status === "missing") {
        response.status(401).json({
            error: "unauthorized",
            error_description:
                "Missing authentication: provide a Bearer token, sign in, or provide x-frontlit-apikey",
        });
        return true;
    }
    response.status(401).json({ error: "unauthorized" });
    return true;
}
