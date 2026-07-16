import { buildRobotsTxt } from "@/lib/sitemap";
import { getPrimaryHost } from "@/lib/request-host";

export async function GET() {
    const primaryHost = await getPrimaryHost();
    return new Response(buildRobotsTxt(primaryHost), {
        headers: { "content-type": "text/plain; charset=utf-8" },
    });
}
