import { getSitemap } from "@/lib/api";
import { buildSitemapXml } from "@/lib/sitemap";
import { getPrimaryHost } from "@/lib/request-host";

export async function GET(_request: Request, { params }: { params: Promise<{ teamId: string }> }) {
    const { teamId } = await params;
    const [entries, primaryHost] = await Promise.all([getSitemap(teamId), getPrimaryHost()]);

    return new Response(buildSitemapXml(primaryHost, entries), {
        headers: { "content-type": "application/xml; charset=utf-8" },
    });
}
