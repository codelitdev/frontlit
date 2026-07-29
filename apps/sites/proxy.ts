import { NextRequest, NextResponse } from "next/server";
import { resolveHost } from "./lib/api";
import { createHostCache, decideHost, normalizeHost } from "./lib/host";

// Module-level: persists across requests within one server instance
// (architecture.md §12.2).
const hostCache = createHostCache();

export async function proxy(request: NextRequest) {
    const requestHost = request.headers.get("host");
    if (!requestHost) return NextResponse.next();
    const host = normalizeHost(requestHost);
    if (!host) return NextResponse.next();

    let resolved = hostCache.get(host);
    if (resolved === undefined) {
        resolved = await resolveHost(host).catch(() => null);
        hostCache.set(host, resolved);
    }

    const decision = decideHost(resolved, {
        pathname: request.nextUrl.pathname,
        search: request.nextUrl.search,
        protocol: request.nextUrl.protocol,
    });

    if (decision.action === "unknown") return NextResponse.next();

    const url = request.nextUrl.clone();
    // Not `_sites` — a leading underscore makes Next.js treat the folder as
    // a private, non-routable segment, which would silently 404 everything.
    url.pathname = `/sites/${decision.teamId}${request.nextUrl.pathname}`;

    // The chat iframe never gets the team's code-injection snippets or its
    // own floating widget button (architecture.md §12.5/§7.3) — flagged via
    // a header instead of restructuring routes, since a nested layout can't
    // opt out of what its parent renders.
    const headers = new Headers(request.headers);
    headers.set("x-frontlit-canonical-host", resolved!.canonicalHost);
    if (request.nextUrl.pathname.startsWith("/embed/"))
        headers.set("x-frontlit-embed", "1");

    return NextResponse.rewrite(url, { request: { headers } });
}

export const config = {
    matcher: [
        // Every request except Next's own internals, static files, and the
        // signed server-to-server webhook callback (architecture.md
        // §12.4's "sole exceptions" pattern — authenticated by an HMAC
        // signature, not a tenant host, so it must never be rewritten).
        "/((?!_next/static|_next/image|favicon.ico|api/webhooks).*)",
    ],
};
