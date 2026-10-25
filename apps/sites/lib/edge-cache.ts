/**
 * Response headers for an optional HTTP cache or CDN in front of the public
 * sites (docs/site-delivery.md §5). Standard headers only, so any cache can
 * use them; FrontLit's own cache (Layer 1) stays the source of truth.
 *
 * - `none` (default): Next's own headers.
 * - `ttl`: the edge keeps a page for `EDGE_CACHE_TTL` seconds; no purging.
 * - `purge`: the edge keeps pages until FrontLit purges their tags.
 *
 * Browsers always revalidate (`max-age=0`), so a publish is never stuck in
 * a visitor's cache.
 */
export type EdgeCacheMode = "none" | "ttl" | "purge";

export function edgeCacheMode(value = process.env.EDGE_CACHE_MODE): EdgeCacheMode {
  return value === "ttl" || value === "purge" ? value : "none";
}

/** Per-visitor or per-request responses: never stored by a shared cache. */
const PRIVATE_PATHS = [/^\/help\/tickets\//, /^\/_preview\//, /^\/embed\/chat\/?$/];

export function isPrivatePath(pathname: string): boolean {
  return PRIVATE_PATHS.some((pattern) => pattern.test(pathname));
}

/** Edge tags for a public path: the Layer 1 tag names (§4.3), derived from
 * the URL so the edge never needs page IDs. */
export function edgeTags(teamId: string, pathname: string): string[] {
  const path = pathname.replace(/\/+$/, "") || "/";
  // Every route renders settings (title, theme, canonical host) or chrome.
  const tags = [`team:${teamId}`, `shell:${teamId}`];
  const [first = ""] = path.slice(1).split("/");
  if (first === "docs") {
    tags.push(`docs:${teamId}`);
    if (path === "/docs") tags.push(`page:${teamId}:docs`);
  } else if (first === "blog") {
    tags.push(`blog:${teamId}`);
    if (path === "/blog") tags.push(`page:${teamId}:blog`);
  } else if (first === "changelog") {
    tags.push(`changelog:${teamId}`);
    if (path === "/changelog") tags.push(`page:${teamId}:changelog`);
  } else if (path === "/sitemap.xml") {
    tags.push(`sitemap:${teamId}`);
  } else if (
    !["robots.txt", "favicon.ico", "opengraph-image", "embed"].includes(first)
  ) {
    tags.push(`page:${teamId}:${path.slice(1)}`);
  }
  return tags;
}

const SWR = "stale-while-revalidate=86400, stale-if-error=604800";

/**
 * Next.js tells HTML and RSC responses apart by the `rsc` request header,
 * and adds an `_rsc` query parameter so caches that ignore `Vary` still key
 * them apart. A request where the two disagree (an `rsc` header without
 * `_rsc` gets a redirect; `_rsc` without the header gets HTML) must never
 * be stored: behind such a cache, one crafted request would otherwise
 * poison the page for every visitor.
 */
export function isMixedRscRequest(request: { rscHeader: boolean; rscParam: boolean }) {
  return request.rscHeader !== request.rscParam;
}

/** Headers to add to a rewritten public response, or null to leave Next's. */
export function edgeCacheHeaders(
  teamId: string,
  pathname: string,
  mode: EdgeCacheMode = edgeCacheMode(),
  ttl = Number(process.env.EDGE_CACHE_TTL) || 60,
  rsc = { rscHeader: false, rscParam: false },
): Record<string, string> | null {
  if (isPrivatePath(pathname)) return { "Cache-Control": "private, no-store" };
  if (isMixedRscRequest(rsc)) return { "Cache-Control": "private, no-store" };
  if (mode === "none") return null;
  const maxAge = mode === "ttl" ? ttl : 31_536_000;
  const headers: Record<string, string> = {
    "Cache-Control": "public, max-age=0, must-revalidate",
    // CDN-Cache-Control (RFC 9213) and Surrogate-Control cover the common
    // CDNs and Varnish; both only apply to shared caches.
    "CDN-Cache-Control": `public, s-maxage=${maxAge}, ${SWR}`,
    "Surrogate-Control": `max-age=${maxAge}, ${SWR}`,
  };
  if (mode === "purge") {
    const tags = edgeTags(teamId, pathname);
    headers["Surrogate-Key"] = tags.join(" ");
    headers["Cache-Tag"] = tags.join(",");
  }
  return headers;
}
