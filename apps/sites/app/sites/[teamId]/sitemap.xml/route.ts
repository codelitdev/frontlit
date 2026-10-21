import { getSitemap } from "@/lib/api";
import { buildSitemapXml } from "@/lib/sitemap";
import { getCanonicalHost, isHiddenFromSearch } from "@/lib/request-host";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const { teamId } = await params;
  const [entries, canonicalHost, hidden] = await Promise.all([
    getSitemap(teamId),
    getCanonicalHost(),
    isHiddenFromSearch(),
  ]);

  return new Response(buildSitemapXml(canonicalHost, hidden ? [] : entries), {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
