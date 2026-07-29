import { buildRobotsTxt } from "@/lib/sitemap";
import { getCanonicalHost } from "@/lib/request-host";

export async function GET() {
    const canonicalHost = await getCanonicalHost();
    return new Response(buildRobotsTxt(canonicalHost), {
        headers: { "content-type": "text/plain; charset=utf-8" },
    });
}
