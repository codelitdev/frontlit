import { getApiReference, getSettings, getSitemap } from "@/lib/api";
import { buildLlmsTxt } from "@/lib/markdown";

/** `/llms.txt`: an index of the site's public content for AI agents. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const { teamId } = await params;
  const [entries, settings, reference] = await Promise.all([
    getSitemap(teamId),
    getSettings(teamId),
    getApiReference(teamId),
  ]);
  return new Response(
    buildLlmsTxt(settings, settings?.hideFromSearch ? [] : entries, Boolean(reference)),
    { headers: { "content-type": "text/plain; charset=utf-8" } },
  );
}
