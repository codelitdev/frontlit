import { Router } from "express";
import { createOAuthPagesRouter } from "@codelitdev/oauth-server-kit/express";
import { authBasePath, hostedLoginMethods, webClientUrl } from "./better-auth";

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

export default router;
