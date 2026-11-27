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
import { runWithOAuthClient } from "./oauth-client-context";

type AuthResolver = (input: AuthInput) => Promise<AuthResult>;

function isSupportSessionCreate(request: Request): boolean {
  const path = (request.originalUrl || request.url).split("?")[0].replace(/\/+$/, "");
  return request.method === "POST" && path === "/support-sessions";
}

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

      // A support-sessions key may only mint support sessions over REST
      // (docs/embedded-support.md §8). Checked here, where every API-key
      // request passes, so no other route or MCP tool can forget it.
      if (
        result.kind === "apikey" &&
        result.apiKeyScope === "support:sessions" &&
        !(mode === "rest" && isSupportSessionCreate(request))
      ) {
        response.status(403).json({
          error: "insufficient_scope",
          error_description:
            "This API key can only create support sessions (POST /support-sessions).",
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
          productRequest.sessionAuthenticatedAt = result.sessionAuthenticatedAt;
        }
        if (result.kind === "oauth") {
          productRequest.oauthToken = result.oauthToken;
          productRequest.clientId = result.clientId;
          productRequest.oauthAudiences = result.audiences;
          productRequest.oauthIssuedAt = result.oauthIssuedAt;
          runWithOAuthClient(result.clientId, next);
          return;
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
