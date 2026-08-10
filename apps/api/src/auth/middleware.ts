import type { NextFunction, Request, Response } from "express";
import {
    type AuthInput,
    type AuthResult,
    resolveAuth,
    sendAuthError,
    setBearerChallenge,
} from "./resolve-auth";
import { MCP_SCOPES_SUPPORTED } from "../mcp/policy";
import { mcpProtectedResourceMetadataUrl } from "./better-auth";

type AuthResolver = (input: AuthInput) => Promise<AuthResult>;

export function createAuthMiddleware(
    mode: "rest" | "mcp",
    authResolver: AuthResolver = resolveAuth,
    resourceMetadataUrl?: string,
    challengeScopes: readonly string[] = [],
) {
    return async function frontLitAuthMiddleware(
        request: Request,
        response: Response,
        next: NextFunction,
    ) {
        try {
            const result = await authResolver({
                authorization: request.headers.authorization,
                apiKeyHeader: request.headers["x-frontlit-apikey"],
                bodyApiKey: request.body?.apikey,
                headers: request.headers,
            });
            if (
                sendAuthError(
                    response,
                    result,
                    resourceMetadataUrl,
                    challengeScopes,
                )
            )
                return;
            if (result.status !== "authenticated") return;

            if (mode === "mcp" && result.kind === "session") {
                if (resourceMetadataUrl) {
                    setBearerChallenge(
                        response,
                        resourceMetadataUrl,
                        challengeScopes,
                    );
                }
                response.status(401).json({
                    error: "unauthorized",
                    error_description:
                        "MCP requires an OAuth bearer token or x-frontlit-apikey; browser sessions are not accepted.",
                });
                return;
            }

            const productRequest = request as any;
            productRequest.authKind = result.kind;
            productRequest.account = result.account;
            if (result.kind === "apikey") {
                productRequest.apiKeyId = result.apiKeyId;
                productRequest.teamId = result.teamId;
            } else {
                request.auth = result.identity;
                productRequest.accountId = result.accountId;
                if (result.kind === "oauth" && result.teamId) {
                    productRequest.teamId = result.teamId;
                }
            }
            if (mode === "mcp" && result.kind === "oauth") {
                productRequest.oauthToken = result.oauthToken;
                productRequest.clientId = result.clientId;
                productRequest.scopes = result.scopes;
            }
            next();
        } catch (error) {
            next(error);
        }
    };
}

export const requireAuth = createAuthMiddleware("rest");
export const mcpAuth = createAuthMiddleware(
    "mcp",
    resolveAuth,
    mcpProtectedResourceMetadataUrl,
    MCP_SCOPES_SUPPORTED,
);
