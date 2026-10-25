import { getSettings, getSitemap } from "@/lib/api";
import { buildSitemapXml } from "@/lib/sitemap";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const { teamId } = await params;
  const [entries, settings] = await Promise.all([
    getSitemap(teamId),
    getSettings(teamId),
  ]);
  return new Response(
    buildSitemapXml(
      settings?.canonicalHost ?? "localhost",
      settings?.hideFromSearch ? [] : entries,
    ),
    { headers: { "content-type": "application/xml; charset=utf-8" } },
  );
}
