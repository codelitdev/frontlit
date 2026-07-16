import type { NextFunction, Request, Response } from "express";
import { AuthResult, resolveAuth, sendAuthError } from "./resolve-auth";
import { mcpProtectedResourceMetadataUrl } from "./better-auth";

type AuthMiddlewareMode = "rest" | "mcp";

function applyAuthToRequest(req: Request, result: AuthResult, mode: AuthMiddlewareMode) {
    if (result.status !== "authenticated") return;

    const anyReq = req as any;
    anyReq.authKind = result.kind;
    anyReq.account = result.account;

    if (result.kind === "apikey") {
        anyReq.apikey = result.apiKey;
        // A key authenticates as exactly one, fixed team — no further
        // resolution needed (see `require-team.ts`).
        anyReq.teamId = result.teamId;
    } else {
        anyReq.accountId = result.accountId;
    }

    if (mode === "mcp" && result.kind === "oauth") {
        anyReq.clientId = result.clientId;
        anyReq.scopes = result.scopes;
    }
}

function createAuthMiddleware(mode: AuthMiddlewareMode, resourceMetadataUrl?: string) {
    return async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
        const result = await resolveAuth({
            authorization: req.headers.authorization,
            apiKeyHeader: req.headers["x-frontlit-apikey"],
            bodyApiKey: (req.body as Record<string, unknown> | undefined)?.apikey,
            headers: req.headers as Record<string, string | string[] | undefined>,
        });

        if (sendAuthError(res, result, resourceMetadataUrl)) return;
        if (result.status !== "authenticated") return;

        applyAuthToRequest(req, result, mode);
        next();
    };
}

export const requireAuth = createAuthMiddleware("rest");
// `/mcp` is the only OAuth-protected resource this API exposes today, so its
// metadata URL is threaded through unconditionally — see
// `mcpProtectedResourceMetadataUrl` in `./better-auth.ts` for why this is
// required for spec-compliant MCP/OAuth clients to work at all.
export const mcpAuth = createAuthMiddleware("mcp", mcpProtectedResourceMetadataUrl);
