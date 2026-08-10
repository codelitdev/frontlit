import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins/email-otp";
import { jwt } from "better-auth/plugins/jwt";
import { oauthProvider } from "@better-auth/oauth-provider";
import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client";
import { cimd } from "@better-auth/cimd";
import { createOAuthProviderOptions } from "@codelitdev/oauth-server-kit/better-auth";
import type { HostedLoginMethod } from "@codelitdev/oauth-server-kit/express";
import { createTransport } from "nodemailer";
import { db } from "../db/client";
import * as schema from "../db/schema";
import { logger } from "../services/log";
import { ensureFrontLitAccountForUser } from "../account/queries";
import {
    createFrontLitOAuthTeamSelectionHooks,
    oauthTeamSelectionAdapter,
} from "./oauth-team-selection";
import { MCP_SCOPES_SUPPORTED } from "../mcp/policy";
import { fetchClientMetadataResource } from "./cimd-fetch";

export const webClientUrl = process.env.WEB_CLIENT || "http://localhost:3000";
const apiUrl = process.env.API_PUBLIC_URL || process.env.BETTER_AUTH_URL;
const authBaseUrl = apiUrl || "http://localhost:4000";
export const authBasePath = "/api/auth";

/** Parent domain shared by `apps/web` and `apps/api` in production. When
 * set, the session cookie is scoped to this domain instead of being
 * host-only, so a session started on one subdomain is valid on the other.
 * Left unset in local dev: `localhost` cookies already aren't port-scoped. */
const authCookieDomain = process.env.AUTH_COOKIE_DOMAIN;

/** The actual `iss` Better Auth puts on every JWT it signs is
 * `baseURL + basePath` (i.e. `ctx.context.baseURL`), not just `baseURL` —
 * confirmed against this server's own `/.well-known/oauth-authorization-server`
 * (`issuer` there is `http://localhost:4000/api/auth`, not `http://localhost:4000`).
 * `resolve-auth.ts` must verify against this same value or every bearer
 * token gets rejected with `invalid_token` regardless of anything else. */
export const authIssuer = `${authBaseUrl}${authBasePath}`;

/** The MCP resource identifier advertised in protected-resource metadata
 * (`mcp/routes.ts`). Spec-compliant OAuth/MCP clients request an access
 * token scoped to this exact `resource`/`aud` value. */
export const mcpResourceUrl = `${authBaseUrl}/mcp`;

/** Resource audiences accepted during bearer-token verification. */
export const validOAuthAudiences = [authBaseUrl, mcpResourceUrl];
export const OAUTH_CLIENT_DEFAULT_SCOPES = [
    "openid",
    "profile",
    "email",
] as const;
export const OAUTH_CLIENT_REQUESTABLE_SCOPES = [
    "offline_access",
    ...MCP_SCOPES_SUPPORTED,
] as const;
const supportedOAuthScopes = [
    ...OAUTH_CLIENT_DEFAULT_SCOPES,
    ...OAUTH_CLIENT_REQUESTABLE_SCOPES,
] as const;

/** Where an MCP client should discover `mcpResourceUrl`'s protected-resource
 * metadata (RFC 9728: `<origin>/.well-known/oauth-protected-resource<path>`).
 * Sent back as the `WWW-Authenticate: Bearer resource_metadata="..."` challenge
 * on 401s from `/mcp` (see `auth/middleware.ts`) — without this, spec-compliant
 * clients have no way to discover it and never learn to request a token with
 * `resource=mcpResourceUrl`, so Better Auth mints an opaque (non-JWT) token
 * that this API can't verify at all. */
export const mcpProtectedResourceMetadataUrl = `${authBaseUrl}/.well-known/oauth-protected-resource/mcp`;

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

async function sendOtpEmail(email: string, otp: string) {
    if (process.env.NODE_ENV !== "production") {
        logger.info({ email, otp }, "[Dev] Better Auth OTP generated");
        return;
    }

    if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER) {
        logger.error(
            { email },
            "Cannot send OTP email: SMTP is not configured",
        );
        return;
    }

    const transporter = createTransport({
        host: process.env.EMAIL_HOST,
        port: Number(process.env.EMAIL_PORT) || 587,
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });

    await transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to: email,
        subject: "Your FrontLit verification code",
        text: `Enter this code to sign in to FrontLit: ${otp}`,
        html: `<p>Enter this code to sign in to FrontLit:</p><h2>${otp}</h2>`,
    });
}

export { oauthTeamSelectionAdapter };

export const hostedLoginMethods: HostedLoginMethod[] = [
    { type: "email-otp" },
    ...(googleClientId && googleClientSecret
        ? [
              {
                  type: "social" as const,
                  providerId: "google",
                  label: "Continue with Google",
              },
          ]
        : []),
];

export const auth = betterAuth({
    appName: "FrontLit",
    baseURL: authBaseUrl,
    basePath: authBasePath,
    secret: process.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
        provider: "pg",
        schema,
    }),
    trustedOrigins: [webClientUrl, authBaseUrl],
    // Better Auth deliberately returns an empty 500 body for unexpected
    // production errors. Keep a sanitized server-side record: OAuth clients
    // need the opaque response, while operators need the failure cause to
    // diagnose a failed token exchange. Do not log the request URL because it
    // can contain authorization codes and other credentials.
    onAPIError: {
        onError(error) {
            // Expected OAuth rejections (invalid grant, PKCE mismatch, and so
            // on) are client-visible 4xx responses, not operational errors.
            if (
                error instanceof APIError &&
                error.status !== "INTERNAL_SERVER_ERROR"
            ) {
                return;
            }

            logger.error(
                {
                    errorType:
                        error instanceof Error ? error.name : "UnknownError",
                    error:
                        error instanceof APIError
                            ? (error.body?.error_description ??
                              error.body?.error ??
                              error.status)
                            : error instanceof Error
                              ? error.message
                              : String(error),
                },
                "Better Auth API request failed",
            );
        },
    },
    advanced: authCookieDomain
        ? {
              crossSubDomainCookies: {
                  enabled: true,
                  domain: authCookieDomain,
              },
          }
        : undefined,
    user: {
        modelName: "authUser",
    },
    session: {
        modelName: "authSession",
        expiresIn: 60 * 60 * 24 * 30,
        updateAge: 60 * 60 * 24,
    },
    account: {
        modelName: "authAccount",
    },
    verification: {
        modelName: "authVerification",
    },
    socialProviders:
        googleClientId && googleClientSecret
            ? {
                  google: {
                      clientId: googleClientId,
                      clientSecret: googleClientSecret,
                  },
              }
            : undefined,
    databaseHooks: {
        user: {
            create: {
                async after(user) {
                    if (user.email) {
                        await ensureFrontLitAccountForUser({
                            id: user.id,
                            email: user.email,
                            name: user.name,
                        });
                    }
                },
            },
        },
    },
    hooks: {
        before: createAuthMiddleware(async (context) => {
            if (context.path !== "/oauth2/authorize") return;

            const scope = context.query?.scope;
            if (typeof scope === "string" && scope.trim().length > 0) return;

            // Better Auth can otherwise substitute a client's complete
            // capability set when scope is omitted. Require an explicit grant
            // so registration never becomes full MCP authorization.
            throw new APIError("BAD_REQUEST", {
                error: "invalid_scope",
                error_description:
                    "OAuth authorization requests must include an explicit scope.",
            });
        }),
    },
    plugins: [
        emailOTP({
            async sendVerificationOTP({ email, otp }) {
                await sendOtpEmail(email, otp);
            },
            storeOTP: "hashed",
            expiresIn: 5 * 60,
            allowedAttempts: 5,
            rateLimit: {
                window: 60,
                max: 3,
            },
        }),
        jwt(),
        oauthProvider({
            ...createOAuthProviderOptions({
                loginPage: `${authBaseUrl}/oauth/login`,
                consentPage: `${authBaseUrl}/oauth/consent`,
                allowDynamicClientRegistration: true,
                allowUnauthenticatedDynamicClientRegistration: true,
                scopes: supportedOAuthScopes,
                validAudiences: validOAuthAudiences,
                clientRegistrationDefaultScopes: OAUTH_CLIENT_DEFAULT_SCOPES,
                clientRegistrationAllowedScopes:
                    OAUTH_CLIENT_REQUESTABLE_SCOPES,
            }),
            // The app-level auth test verifies this exact external metadata
            // endpoint. Suppress the provider's configuration reminder only
            // after that route is proven to exist.
            silenceWarnings: {
                oauthAuthServerConfig: true,
            },
            resources: [
                {
                    identifier: mcpResourceUrl,
                    name: "FrontLit MCP",
                    allowedScopes: [...MCP_SCOPES_SUPPORTED],
                },
            ],
            clientRegistrationDefaultResources: [mcpResourceUrl],
            schema: {
                oauthClient: {
                    modelName: "authOAuthClient",
                },
                oauthResource: {
                    modelName: "authOAuthResource",
                },
                oauthClientResource: {
                    modelName: "authOAuthClientResource",
                },
                oauthAccessToken: {
                    modelName: "authOAuthAccessToken",
                },
                oauthRefreshToken: {
                    modelName: "authOAuthRefreshToken",
                },
                oauthConsent: {
                    modelName: "authOAuthConsent",
                },
                oauthClientAssertion: {
                    modelName: "authOAuthClientAssertion",
                },
            },
            ...createFrontLitOAuthTeamSelectionHooks({
                page: `${authBaseUrl}/oauth/select-team`,
                adapter: oauthTeamSelectionAdapter,
            }),
        }),
        cimd({
            fetchClientMetadataResource,
            metadataProfile: "mcp-2026-07-28",
            metadataRevalidationInterval: "60m",
            metadataFetchPolicy: {
                // VS Code's canonical metadata is no-store and must be
                // refetched immediately during the token exchange.
                minimumFetchInterval: 0,
            },
            originBoundFields: ["post_logout_redirect_uris", "client_uri"],
        }),
    ],
});

export const oauthResourceClient = oauthProviderResourceClient(auth);
