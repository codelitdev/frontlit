/** Product-specific Better Auth cookie prefix. Session cookies are named
 * `<prefix>.session_token`, so products on one browser hostname do not
 * overwrite each other's cookies. See `platform/AGENTS.md`. */
export const AUTH_COOKIE_PREFIX = "frontlit";
