import type { AuthInfo, ServerContext } from "@modelcontextprotocol/server";
import type { Account } from "../account/queries";

type McpAccount = Pick<Account, "id" | "email">;

export type FrontLitMcpAuthExtra = {
    authKind: "oauth" | "api_key";
    teamId: string;
    account: McpAccount | null;
};

export type FrontLitMcpAuthInfo = AuthInfo & {
    extra: FrontLitMcpAuthExtra;
};

type McpAuthRequest = {
    authKind?: unknown;
    teamId?: unknown;
    oauthToken?: unknown;
    clientId?: unknown;
    scopes?: unknown;
    apiKeyId?: unknown;
    account?: Account | null;
};

export function createFrontLitMcpAuthInfo(
    input: unknown,
): FrontLitMcpAuthInfo | null {
    if (!input || typeof input !== "object") return null;
    const req = input as McpAuthRequest;
    const teamId = typeof req.teamId === "string" ? req.teamId : null;
    if (!teamId) return null;

    if (req.authKind === "oauth") {
        if (
            typeof req.oauthToken !== "string" ||
            typeof req.clientId !== "string"
        ) {
            return null;
        }
        return {
            token: req.oauthToken,
            clientId: req.clientId,
            scopes: Array.isArray(req.scopes)
                ? req.scopes.filter(
                      (scope): scope is string => typeof scope === "string",
                  )
                : [],
            extra: {
                authKind: "oauth",
                teamId,
                account: req.account
                    ? { id: req.account.id, email: req.account.email }
                    : null,
            },
        };
    }

    if (req.authKind === "apikey" && typeof req.apiKeyId === "string") {
        return {
            // The SDK requires a token field for AuthInfo pass-through. Use a
            // stable key identifier, never the submitted API-key secret.
            token: req.apiKeyId,
            clientId: `api-key:${req.apiKeyId}`,
            scopes: [],
            extra: {
                authKind: "api_key",
                teamId,
                account: null,
            },
        };
    }

    return null;
}

export function getFrontLitMcpAuthInfo(
    ctx: ServerContext,
): FrontLitMcpAuthInfo | null {
    const authInfo = ctx.http?.authInfo;
    const extra = authInfo?.extra as FrontLitMcpAuthExtra | undefined;
    if (
        !authInfo ||
        !extra ||
        (extra.authKind !== "oauth" && extra.authKind !== "api_key") ||
        typeof extra.teamId !== "string"
    ) {
        return null;
    }
    return authInfo as FrontLitMcpAuthInfo;
}
