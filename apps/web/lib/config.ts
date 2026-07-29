export const API_URL = process.env.API_URL || "http://localhost:4000";
export const API_PUBLIC_URL =
    process.env.API_PUBLIC_URL || "http://localhost:4000";

/** This app's own public origin — sent to `apps/api`'s hosted login page
 * (`GET /login?redirect=...`) as where to bounce the browser back to after
 * sign-in. Must match a value `apps/api` allowlists (its own `WEB_CLIENT`
 * env var). */
export const WEB_CLIENT = process.env.WEB_CLIENT || "http://localhost:3000";
