import type { NextFunction, Request, Response } from "express";
import {
    type AuthInput,
    type AuthResult,
    resolveAuth,
    sendAuthError,
} from "./resolve-auth";
import {
    authBaseUrl,
    mcpProtectedResourceMetadataUrl,
    mcpResourceUrl,
} from "./better-auth";

type AuthResolver = (input: AuthInput) => Promise<AuthResult>;

function defaultResolver(mode: "rest" | "mcp"): AuthResolver {
    const expectedAudience = mode === "mcp" ? mcpResourceUrl : authBaseUrl;
    return (input) => resolveAuth(input, undefined, { expectedAudience });
}

export function createAuthMiddleware(
    mode: "rest" | "mcp",
    authResolver: AuthResolver = defaultResolver(mode),
    resourceMetadataUrl?: string,
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
            if (sendAuthError(response, result, resourceMetadataUrl)) return;
            if (result.status !== "authenticated") return;

            if (mode === "mcp" && result.kind === "session") {
                if (resourceMetadataUrl) {
                    response.setHeader(
                        "WWW-Authenticate",
                        `Bearer resource_metadata="${resourceMetadataUrl}"`,
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
                productRequest.scopes = result.scopes;
                if (result.kind === "session") {
                    productRequest.sessionAuthenticatedAt =
                        result.sessionAuthenticatedAt;
                }
                if (result.kind === "oauth") {
                    productRequest.oauthToken = result.oauthToken;
                    productRequest.clientId = result.clientId;
                    productRequest.oauthAudiences = result.audiences;
                    productRequest.oauthIssuedAt = result.oauthIssuedAt;
                    productRequest.oauthTeamInvalid = result.oauthTeamInvalid;
                    productRequest.claimedTeamId = result.claimedTeamId;
                    if (result.teamId) {
                        productRequest.teamId = result.teamId;
                    }
                }
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
    defaultResolver("mcp"),
    mcpProtectedResourceMetadataUrl,
);
