import { getSettings } from "@/lib/api";

// Exact FrontLit mark from
// @codelitdev/design-system/assets/logo-frontlit.svg. Keep this inline so
// the favicon route has no runtime dependency on the design-system package.
const DEFAULT_FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><g fill="oklch(0.62 0.16 230 / 0.15)" stroke="oklch(0.62 0.16 230)" stroke-width="2.4" stroke-linejoin="round"><path d="M0,-11 C5.5,-5.5 5.5,5.5 0,11 C-5.5,5.5 -5.5,-5.5 0,-11 Z" transform="translate(41.19,22.81) rotate(45)"></path><path d="M0,-11 C5.5,-5.5 5.5,5.5 0,11 C-5.5,5.5 -5.5,-5.5 0,-11 Z" transform="translate(41.19,41.19) rotate(135)"></path><path d="M0,-11 C5.5,-5.5 5.5,5.5 0,11 C-5.5,5.5 -5.5,-5.5 0,-11 Z" transform="translate(22.81,41.19) rotate(225)"></path><path d="M0,-11 C5.5,-5.5 5.5,5.5 0,11 C-5.5,5.5 -5.5,-5.5 0,-11 Z" transform="translate(22.81,22.81) rotate(315)"></path></g></svg>`;

function defaultFavicon() {
  return new Response(DEFAULT_FAVICON, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}

/** Serve the current tenant logo from the conventional browser favicon URL.
 * The proxy rewrites the external `/favicon.ico` request to this route after
 * it resolves the request host to a tenant. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const { teamId } = await params;
  const settings = await getSettings(teamId);
  const logoUrl = typeof settings?.logo?.url === "string" ? settings.logo.url : null;

  if (!logoUrl) return defaultFavicon();

  try {
    const logo = await fetch(logoUrl);
    if (!logo.ok || !logo.body) return defaultFavicon();

    return new Response(logo.body, {
      headers: {
        "content-type": logo.headers.get("content-type") || "image/x-icon",
        "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch {
    return defaultFavicon();
  }
}
