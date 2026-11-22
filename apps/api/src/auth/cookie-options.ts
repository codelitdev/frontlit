import { secureCookieOptions } from "@codelitdev/oauth-server-kit/better-auth";
import { AUTH_COOKIE_PREFIX } from "./cookie-prefix";

/** Internal header that carries the client address to Better Auth. The
 * client-IP middleware in `app.ts` overwrites whatever a client sends in it. */
export const CLIENT_IP_HEADER = "x-frontlit-client-ip";

/**
 * Better Auth `advanced` options. The session cookie is
 * `__Host-frontlit.session_token` on a single https host,
 * `__Secure-frontlit.session_token` when `cookieDomain` shares it across
 * subdomains (the web app and API in production), and plain
 * `frontlit.session_token` over http.
 */
export function authCookieOptions(input: { baseURL: string; cookieDomain?: string }) {
  return secureCookieOptions({
    baseURL: input.baseURL,
    cookiePrefix: AUTH_COOKIE_PREFIX,
    ...(input.cookieDomain
      ? { crossSubDomainCookies: { enabled: true, domain: input.cookieDomain } }
      : {}),
    clientIpHeader: CLIENT_IP_HEADER,
  });
}
