import { NextRequest, NextResponse } from "next/server";
import { resolveHost } from "./lib/api";
import { decideHost, lookupHost, normalizeHost } from "./lib/host";

export async function proxy(request: NextRequest) {
  // Direct access to the internal /sites rewrite segment is never allowed.
  if (request.nextUrl.pathname.startsWith("/sites")) {
    return new NextResponse(null, { status: 404 });
  }

  // Page/site file JSON Schemas are the same on every host (frontlit.app
  // serves the canonical `$schema` URLs); see app/schema.
  if (/^\/schema\/(page|site)\.v1\.json$/.test(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const requestHost = request.headers.get("host");
  if (!requestHost) return new NextResponse(null, { status: 404 });
  const host = normalizeHost(requestHost);
  if (!host) return new NextResponse(null, { status: 404 });

  let resolved;
  try {
    resolved = await lookupHost(host, resolveHost);
  } catch {
    // An API outage is not evidence of an unknown tenant, so it is never
    // cached as a 404.
    return new NextResponse("Site temporarily unavailable", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  // Behind the TLS edge the app itself only sees plain HTTP; the edge's
  // forwarded scheme is what the visitor used. The port comes from the raw
  // Host header so local `*.localhost:3002` redirects stay on the dev port.
  // Only a bare scheme is trusted: anything else could steer the redirect
  // to another origin.
  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();
  const decision = decideHost(resolved, {
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    protocol:
      forwardedProto === "http" || forwardedProto === "https"
        ? `${forwardedProto}:`
        : request.nextUrl.protocol,
    port:
      requestHost
        .split(",")[0]
        ?.trim()
        .match(/:(\d+)$/)?.[1] ?? "",
  });

  // Unknown hosts do not map to any tenant site; refuse rather than falling through.
  if (decision.action === "unknown") {
    return new NextResponse(null, { status: 404 });
  }

  if (decision.action === "redirect") {
    // Browsers keep an uncached 301 indefinitely; cap it so a redirect from
    // a stale host lookup or a later primary-host change clears within an hour.
    const response = NextResponse.redirect(decision.location, 301);
    response.headers.set("Cache-Control", "public, max-age=3600");
    return response;
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

  // The rendered response depends only on team and path, never on request
  // headers, so it can be cached and shared (docs/site-delivery.md §4.2).
  const response = NextResponse.rewrite(url);
  // Search visibility: a hidden (pre-launch) site is noindex everywhere; a
  // non-canonical host that still serves (subdomain with redirect off) is
  // noindex so it never competes with the canonical host. A header covers
  // feeds and images too, and keeps the cached HTML host-independent.
  if (resolved!.hideFromSearch || host !== resolved!.canonicalHost)
    response.headers.set("X-Robots-Tag", "noindex");
  return response;
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
