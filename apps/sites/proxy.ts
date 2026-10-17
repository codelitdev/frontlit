import { NextRequest, NextResponse } from "next/server";
import { resolveHost } from "./lib/api";
import { decideHost, hostCache, normalizeHost } from "./lib/host";

export async function proxy(request: NextRequest) {
  const docs = /(?:^|\/)docs(?:\/|$)/.test(request.nextUrl.pathname);
  const uncached = (response: NextResponse) => {
    if (docs) response.headers.set("Cache-Control", "no-store");
    return response;
  };

  // Direct access to the internal /sites rewrite segment is never allowed.
  if (request.nextUrl.pathname.startsWith("/sites")) {
    return uncached(new NextResponse(null, { status: 404 }));
  }

  // Page/site file JSON Schemas are the same on every host (frontlit.app
  // serves the canonical `$schema` URLs); see app/schema.
  if (/^\/schema\/(page|site)\.v1\.json$/.test(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const requestHost = request.headers.get("host");
  if (!requestHost) return uncached(new NextResponse(null, { status: 404 }));
  const host = normalizeHost(requestHost);
  if (!host) return uncached(new NextResponse(null, { status: 404 }));

  let resolved = hostCache.get(host);
  if (resolved === undefined) {
    try {
      resolved = await resolveHost(host);
      hostCache.set(host, resolved);
    } catch {
      // An API outage is not evidence of an unknown tenant. Avoid caching
      // it as a 404 for the next minute.
      return new NextResponse("Site temporarily unavailable", {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    }
  }

  const decision = decideHost(resolved, {
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    protocol: request.nextUrl.protocol,
  });

  // Unknown hosts do not map to any tenant site; refuse rather than falling through.
  if (decision.action === "unknown") {
    return uncached(new NextResponse(null, { status: 404 }));
  }

  const url = request.nextUrl.clone();
  // Not `_sites` — a leading underscore makes Next.js treat the folder as
  // a private, non-routable segment, which would silently 404 everything.
  url.pathname = `/sites/${decision.teamId}${request.nextUrl.pathname}`;
  // Signed pull request previews: /_preview/<releaseId>/<slug>. Next treats
  // `_`-prefixed folders as private, so the route lives at release-preview.
  if (request.nextUrl.pathname.startsWith("/_preview/")) {
    url.pathname = `/sites/${decision.teamId}/release-preview/${request.nextUrl.pathname.slice("/_preview/".length)}`;
  }

  // The chat iframe never gets the team's code-injection snippets or its
  // own floating widget button (architecture.md §12.5/§7.3) — flagged via
  // a header instead of restructuring routes, since a nested layout can't
  // opt out of what its parent renders.
  const headers = new Headers(request.headers);
  headers.set("x-frontlit-canonical-host", resolved!.canonicalHost);
  headers.set("x-frontlit-team-id", decision.teamId);
  if (request.nextUrl.pathname.startsWith("/embed/"))
    headers.set("x-frontlit-embed", "1");

  return uncached(NextResponse.rewrite(url, { request: { headers } }));
}

export const config = {
  matcher: [
    // Every request except Next's own internals, self-hosted theme fonts and the
    // signed server-to-server webhook callback (architecture.md
    // §12.4's "sole exceptions" pattern — authenticated by an HMAC
    // signature, not a tenant host, so it must never be rewritten).
    // `/favicon.ico` is intentionally included: it is resolved to the
    // requesting tenant by `app/sites/[teamId]/favicon.ico/route.ts`.
    "/((?!_next/static|_next/image|fonts/|api/webhooks).*)",
  ],
};
