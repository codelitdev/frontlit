/** Server-only — used for SSR reads via lib/api.ts. Never sent to the browser. */
export const API_URL = process.env.API_URL || "http://localhost:4000";

/** The API's browser-reachable origin — handed to client-side page-builder
 * blocks (email-form, support-form) as `pageData.publicApiBaseUrl` so their
 * `fetch()` calls from the visitor's browser resolve correctly. Distinct
 * from `API_URL` whenever the server-side and public origins differ (e.g.
 * an internal service hostname vs. the public api.<domain>), same split
 * apps/web makes between `API_URL` and `API_PUBLIC_URL`. */
export const API_PUBLIC_URL = process.env.API_PUBLIC_URL || API_URL;

/** The dedicated widget origin (docs/embedded-support.md §6.3): serves the
 * chat iframe and its settings, and nothing else. */
export const EMBED_ORIGIN = (
  process.env.EMBED_ORIGIN || "http://embed.localhost:3002"
).replace(/\/+$/, "");

/** Host part of `EMBED_ORIGIN`, matched against the request host in proxy.ts. */
export const EMBED_HOST = new URL(EMBED_ORIGIN).hostname;
