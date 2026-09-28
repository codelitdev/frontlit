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
