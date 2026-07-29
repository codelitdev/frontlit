import {
    createCentralAuthMiddleware,
    type CentralAuthInput,
} from "@codelitdev/oauth-server-kit";
import {
    type AuthResult,
    resolveAuth,
} from "./resolve-auth";
import { mcpProtectedResourceMetadataUrl } from "./better-auth";

type AuthResolver = (
    input: CentralAuthInput,
) => Promise<AuthResult>;

export function createAuthMiddleware(
    mode: "rest" | "mcp",
    authResolver: AuthResolver = resolveAuth,
    resourceMetadataUrl?: string,
) {
    return createCentralAuthMiddleware({
        mode,
        resolveAuth: authResolver,
        apiKeyHeaderName: "x-frontlit-apikey",
        resourceMetadataUrl,
    });
}

export const requireAuth = createAuthMiddleware("rest");
export const mcpAuth = createAuthMiddleware(
    "mcp",
    resolveAuth,
    mcpProtectedResourceMetadataUrl,
);
