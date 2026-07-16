/** Server-only — used for SSR reads via lib/api.ts. Never sent to the browser. */
export const API_URL = process.env.API_URL || "http://localhost:4000";

/** The API's browser-reachable origin — handed to client-side page-builder
 * blocks (email-form, support-form) as `pageData.publicApiBaseUrl` so their
 * `fetch()` calls from the visitor's browser resolve correctly. Distinct
 * from `API_URL` whenever the server-side and public origins differ (e.g.
 * an internal service hostname vs. the public api.<domain>), same split
 * apps/web makes between `API_URL` and `API_PUBLIC_URL`. */
export const API_PUBLIC_URL = process.env.API_PUBLIC_URL || API_URL;

/** This app's own public origin — used for canonical URLs, sitemap/RSS
 * entries and the JSON-LD `WebSite`/`Organization` builders (architecture.md
 * §12.3). apps/sites has no session of its own, so unlike apps/web there's
 * no separate "browser-facing" origin to distinguish. */
export const SITES_BASE_URL = process.env.SITES_BASE_URL || "http://localhost:3002";
