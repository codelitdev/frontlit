import { buildRobotsTxt } from "@/lib/sitemap";
import { getCanonicalHost, isHiddenFromSearch } from "@/lib/request-host";

export async function GET() {
  const [canonicalHost, hidden] = await Promise.all([
    getCanonicalHost(),
    isHiddenFromSearch(),
  ]);
  return new Response(buildRobotsTxt(canonicalHost, hidden), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
