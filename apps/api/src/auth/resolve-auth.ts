import { fromNodeHeaders } from "better-auth/node";
import type { Response } from "express";
import { verifyOAuthBearerToken } from "@codelitdev/oauth-server-kit";
import { auth, authIssuer, mcpResourceUrl, oauthResourceClient, validOAuthAudiences } from "./better-auth";
import { ensureAccountForAuthUser, ensureAccountForAuthUserId } from "../team/queries";
import { getApiKeyBySecret } from "../apikey/queries";

type Account = { id: string; email: string; authUserId: string | null };

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
          account: Account;
          accountId: string;
          clientId: string;
          scopes: string[];
          /** Not resolved here — a bearer-token account may belong to
           * several teams. See `auth/require-team.ts`, which resolves it from
           * an explicit header (falling back to the account's sole team, if
           * it only has one). */
          teamId?: undefined;
      }
    | {
          status: "authenticated";
          kind: "session";
          account: Account;
          accountId: string;
          clientId?: undefined;
          scopes: string[];
          teamId?: undefined;
      }
    | {
          status: "authenticated";
          kind: "apikey";
          /** A key has no single owning account — a team can have several
           * members — so `account`/`accountId` are unset for key auth. */
          account: null;
          accountId?: undefined;
          apiKey: string;
          /** A key always authenticates as exactly one, fixed team. */
          teamId: string;
      }
    | { status: "invalid_token" }
    | { status: "unauthorized" }
    | { status: "missing" };

/** `resourceMetadataUrl`, when given, is sent back as a
 * `WWW-Authenticate: Bearer resource_metadata="..."` challenge (RFC 9728) so
 * spec-compliant OAuth/MCP clients can discover where to look up this
 * resource's metadata — and, in turn, learn to request a token with the
 * matching `resource` parameter instead of an unscoped (opaque) one. See
 * `mcpProtectedResourceMetadataUrl` in `./better-auth.ts`. */
export function sendAuthError(res: Response, result: AuthResult, resourceMetadataUrl?: string): boolean {
    if (resourceMetadataUrl && (result.status === "invalid_token" || result.status === "missing" || result.status === "unauthorized")) {
        res.setHeader("WWW-Authenticate", `Bearer resource_metadata="${resourceMetadataUrl}"`);
    }

    if (result.status === "invalid_token") {
        res.status(401).json({ error: "invalid_token", error_description: "Access token is invalid or expired" });
        return true;
    }

    if (result.status === "missing") {
        res.status(401).json({
            error: "unauthorized",
            error_description: "Missing authentication: provide Authorization: Bearer <token>, sign in, or provide an x-frontlit-apikey header",
        });
        return true;
    }

    if (result.status === "unauthorized") {
        res.status(401).json({ error: "unauthorized" });
        return true;
    }

    return false;
}

function getHeaderValue(value: unknown): string | undefined {
    if (Array.isArray(value)) {
        return typeof value[0] === "string" ? value[0] : undefined;
    }
    return typeof value === "string" ? value : undefined;
}

export async function resolveAuth(input: AuthInput): Promise<AuthResult> {
    const authorization = getHeaderValue(input.authorization);
    if (authorization) {
        const match = authorization.match(/^Bearer (.+)$/i);
        if (match) {
            const claims = await verifyOAuthBearerToken(
                { oauthResourceClient, validAudiences: validOAuthAudiences, issuer: authIssuer, mcpResourceUrl },
                match[1],
            );
            if (!claims?.sub) return { status: "invalid_token" };

            const account = await ensureAccountForAuthUserId(claims.sub);
            if (!account) return { status: "unauthorized" };

            return {
                status: "authenticated",
                kind: "oauth",
                account,
                accountId: account.id,
                clientId: String(claims.azp || "better-auth"),
                scopes: typeof claims.scope === "string" ? claims.scope.split(/\s+/).filter(Boolean) : [],
            };
        }
    }

    if (input.headers) {
        const session = await auth.api.getSession({ headers: fromNodeHeaders(input.headers) });
        if (session?.user?.email) {
            const account = await ensureAccountForAuthUser(session.user.id, session.user.email);
            return {
                status: "authenticated",
                kind: "session",
                account,
                accountId: account.id,
                scopes: ["web"],
            };
        }
    }

    const submittedApiKey = getHeaderValue(input.bodyApiKey) || getHeaderValue(input.apiKeyHeader);
    if (!submittedApiKey) return { status: "missing" };

    const apiKey = await getApiKeyBySecret(submittedApiKey);
    if (!apiKey) return { status: "unauthorized" };

    return {
        status: "authenticated",
        kind: "apikey",
        account: null,
        apiKey: submittedApiKey,
        teamId: apiKey.teamId,
    };
}
