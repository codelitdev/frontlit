import { headers } from "next/headers";

/**
 * The request's `Host` header. Within any `/sites/[teamId]/...` route this
 * is guaranteed to already be the team's *primary* host — the middleware
 * only rewrites (rather than 308-redirecting) once a host resolves as
 * primary (architecture.md §12.1/§12.2) — so routes can use it directly for
 * canonical URLs, JSON-LD and RSS/sitemap absolute links without a second
 * lookup.
 */
export async function getPrimaryHost(): Promise<string> {
    const h = await headers();
    return h.get("host") ?? "localhost";
}
