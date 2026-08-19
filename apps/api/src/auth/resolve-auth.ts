import { fromNodeHeaders } from "better-auth/node";
import {
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
import { getSessionAuthenticatedAt } from "./session-freshness";

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
          oauthToken: string;
          clientId: string;
          scopes: string[];
          teamId?: string;
          claimedTeamId?: string;
          oauthTeamInvalid?: boolean;
          oauthIssuedAt?: Date;
          audiences: string[];
      }
    | {
          status: "authenticated";
          kind: "session";
          identity: Extract<AuthenticatedIdentity, { method: "session" }>;
          account: Account;
          accountId: string;
          scopes: ["web"];
          sessionAuthenticatedAt?: Date;
      }
    | {
          status: "authenticated";
          kind: "apikey";
          account: null;
          apiKeyId: string;
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
    authenticateBearer: (
        token: string,
        expectedAudience?: string,
    ) => Promise<{
        identity: Extract<AuthenticatedIdentity, { method: "oauth" }>;
        teamId?: string;
        issuedAt?: Date;
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
    ) => Promise<
        { createdAt?: Date } | Record<string, unknown> | null | undefined
    >;
    getSessionAuthenticatedAt?: (
        userId: string,
        headers?: Record<string, string | string[] | undefined>,
    ) => Promise<Date | undefined>;
};

export type ResolveAuthOptions = {
    expectedAudience?: string;
};

function headerValue(value: unknown): string | undefined {
    if (Array.isArray(value)) {
        return typeof value[0] === "string" ? value[0] : undefined;
    }
    return typeof value === "string" ? value : undefined;
}

function optionalString(value: unknown): string | undefined {
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stringClaims(value: unknown): string[] {
    if (typeof value === "string") return [value];
    return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [];
}

const defaultDependencies: AuthDependencies = {
    getApiKeyBySecret,
    async resolveSession(headers) {
        return resolveBetterAuthSession(
            { auth, issuer: authIssuer },
            fromNodeHeaders(headers),
        );
    },
    async authenticateBearer(token, expectedAudience) {
        try {
            // Use Better Auth's current resource-server API. The published
            // oauth-server-kit helper targets an obsolete resource-client
            // action and rejects otherwise valid SDK 2 bearer tokens.
            const acceptedAudiences = expectedAudience
                ? [expectedAudience]
                : validOAuthAudiences;
            const claims = await oauthResourceClient
                .getActions()
                .verifyBearerToken(token, {
                    verifyOptions: {
                        issuer: authIssuer,
                        audience: acceptedAudiences,
                    },
                    resourceMetadataMappings: { mcp: mcpResourceUrl },
                });
            const subject = optionalString(claims.sub);
            const clientId =
                optionalString(claims.azp) ?? optionalString(claims.client_id);
            const audiences = stringClaims(claims.aud).filter((audience) =>
                acceptedAudiences.includes(audience),
            );
            if (!subject || !clientId || audiences.length === 0) return null;
            const email = optionalString(claims.email);
            const name = optionalString(claims.name);
            const scopes = stringClaims(claims.scope).flatMap((scope) =>
                scope.split(/\s+/).filter(Boolean),
            );
            const issuedAt =
                typeof claims.iat === "number"
                    ? new Date(claims.iat * 1000)
                    : undefined;

            return {
                identity: {
                    method: "oauth",
                    issuer: authIssuer,
                    subject,
                    ...(email ? { email } : {}),
                    ...(name ? { name } : {}),
                    clientId,
                    scopes,
                    audiences,
                },
                teamId: optionalString(claims.team_id),
                issuedAt,
            };
        } catch {
            return null;
        }
    },
    ensureAccountForBetterAuthUserId: ensureFrontLitAccountForBetterAuthUserId,
    ensureAccountForUser: ensureFrontLitAccountForUser,
    getTeamMembership,
    getSessionAuthenticatedAt,
};

export async function resolveAuth(
    input: AuthInput,
    dependencies: AuthDependencies = defaultDependencies,
    options: ResolveAuthOptions = {},
): Promise<AuthResult> {
    const authorization = headerValue(input.authorization);
    if (authorization) {
        const match = authorization.match(/^Bearer\s+(.+)$/i);
        if (match) {
            const authenticated = await dependencies.authenticateBearer(
                match[1],
                options.expectedAudience,
            );
            if (!authenticated) return { status: "invalid_token" };
            const account = await dependencies.ensureAccountForBetterAuthUserId(
                authenticated.identity.subject,
            );
            if (!account) return { status: "unauthorized" };

            const claimedTeamId = authenticated.teamId;
            let teamId: string | undefined;
            let oauthTeamInvalid = false;
            if (claimedTeamId) {
                const membership = await dependencies.getTeamMembership(
                    claimedTeamId,
                    account.id,
                );
                const createdAt =
                    membership &&
                    "createdAt" in membership &&
                    membership.createdAt instanceof Date
                        ? membership.createdAt
                        : undefined;
                const generationOk = Boolean(
                    authenticated.issuedAt &&
                    createdAt &&
                    authenticated.issuedAt.getTime() >= createdAt.getTime(),
                );
                if (membership && generationOk) {
                    teamId = claimedTeamId;
                } else {
                    oauthTeamInvalid = true;
                }
            }
            return {
                status: "authenticated",
                kind: "oauth",
                identity: authenticated.identity,
                account,
                accountId: account.id,
                oauthToken: match[1],
                clientId: authenticated.identity.clientId,
                scopes: authenticated.identity.scopes,
                teamId,
                claimedTeamId,
                oauthTeamInvalid,
                oauthIssuedAt: authenticated.issuedAt,
                audiences: authenticated.identity.audiences,
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
            apiKeyId: apiKey.id,
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
            const sessionAuthenticatedAt =
                await dependencies.getSessionAuthenticatedAt?.(
                    result.identity.subject,
                    input.headers,
                );
            return {
                status: "authenticated",
                kind: "session",
                identity: result.identity,
                account,
                accountId: account.id,
                scopes: ["web"],
                sessionAuthenticatedAt,
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
