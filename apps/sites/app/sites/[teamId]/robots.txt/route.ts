import { getSettings } from "@/lib/api";
import { buildRobotsTxt } from "@/lib/sitemap";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const { teamId } = await params;
  const settings = await getSettings(teamId);
  return new Response(
    buildRobotsTxt(settings?.canonicalHost ?? "localhost", !!settings?.hideFromSearch),
    { headers: { "content-type": "text/plain; charset=utf-8" } },
  );
}
