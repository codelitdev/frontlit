import { headers } from "next/headers";

/**
 * The middleware resolves this team's canonical host and injects it into the
 * rewritten request. A public FrontLit subdomain and a verified custom
 * domain render normally; metadata, JSON-LD and feeds use the
 * canonical host without another API lookup.
 */
export async function getCanonicalHost(): Promise<string> {
  const h = await headers();
  return h.get("x-frontlit-canonical-host") ?? h.get("host") ?? "localhost";
}

/** The whole site is hidden from search engines (pre-launch): robots.txt
 * disallows everything and the sitemap is empty. */
export async function isHiddenFromSearch(): Promise<boolean> {
  return (await headers()).get("x-frontlit-hidden") === "1";
}

/** This request must not be indexed: the site is hidden, or it is served on a
 * non-canonical host (a FrontLit subdomain kept serving next to a custom
 * domain). */
export async function isNoindex(): Promise<boolean> {
  return (await headers()).get("x-frontlit-noindex") === "1";
}
