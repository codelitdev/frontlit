import { getWidgetConfig } from "@/lib/embed-config";
import { edgeCacheMode } from "@/lib/edge-cache";

/**
 * Public widget settings for the embed loader on external sites
 * (docs/embedded-support.md §6.3, §6.8). Reached only through
 * `embed.<domain>/<teamId>/config` (proxy.ts). Browsers keep it for a
 * minute; an edge cache keeps it until the team's `shell` tag is purged,
 * which saving the chatbot settings does.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const { teamId } = await params;
  const config = await getWidgetConfig(teamId);
  if (!config) return new Response(null, { status: 404 });
  const headers: Record<string, string> = {
    "Cache-Control": "public, max-age=60",
    // Loaded with fetch() from the customer's own site.
    "Access-Control-Allow-Origin": "*",
  };
  if (edgeCacheMode() === "purge") {
    const tags = [`team:${teamId}`, `shell:${teamId}`];
    headers["CDN-Cache-Control"] = "public, s-maxage=31536000";
    headers["Surrogate-Key"] = tags.join(" ");
    headers["Cache-Tag"] = tags.join(",");
  }
  return Response.json(config, { headers });
}
