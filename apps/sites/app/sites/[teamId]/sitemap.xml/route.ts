import { getSitemap } from "@/lib/api";
import { buildSitemapXml } from "@/lib/sitemap";
import { getCanonicalHost } from "@/lib/request-host";

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ teamId: string }> },
) {
    const { teamId } = await params;
    const [entries, canonicalHost] = await Promise.all([
        getSitemap(teamId),
        getCanonicalHost(),
    ]);

    return new Response(buildSitemapXml(canonicalHost, entries), {
        headers: { "content-type": "application/xml; charset=utf-8" },
    });
}
