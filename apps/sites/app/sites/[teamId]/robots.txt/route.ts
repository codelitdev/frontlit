import { buildRobotsTxt } from "@frontlit/site-seo";
import { getSettings } from "@/lib/api";

/** Per-host robots policy (architecture.md §12.3). The embed iframe is
 * disallowed: it's an isolated widget surface, not a content page. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const { teamId } = await params;
  const settings = await getSettings(teamId);
  return new Response(
    buildRobotsTxt({
      canonicalHost: settings?.canonicalHost ?? "localhost",
      hidden: !!settings?.hideFromSearch,
      disallow: ["/embed/"],
    }),
    { headers: { "content-type": "text/plain; charset=utf-8" } },
  );
}
