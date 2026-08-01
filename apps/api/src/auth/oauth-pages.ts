import { Router } from "express";
import { createOAuthPagesRouter } from "@codelitdev/oauth-server-kit/express";
import {
    auth,
    authBasePath,
    hostedLoginMethods,
    oauthTeamSelectionAdapter,
    webClientUrl,
} from "./better-auth";
import { createFrontLitOAuthTeamPages } from "./oauth-team-pages";

const router = Router();

router.use(
    createOAuthPagesRouter({
        appName: "FrontLit",
        authBasePath,
        allowedRedirectOrigins: [webClientUrl],
        defaultRedirectUrl: new URL("/", webClientUrl).toString(),
        loginMethods: hostedLoginMethods,
        legacyHostOnlySessionCookieNames: process.env.AUTH_COOKIE_DOMAIN
            ? [
                  "__Secure-better-auth.session_token",
                  "__Secure-better-auth.session_data",
                  "__Secure-better-auth.dont_remember",
              ]
            : undefined,
    }),
);
router.use(
    createFrontLitOAuthTeamPages({
        auth,
        adapter: oauthTeamSelectionAdapter,
        authBasePath,
    }),
);

export default router;
