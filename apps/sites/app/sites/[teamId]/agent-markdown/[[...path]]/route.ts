import { getSettings } from "@/lib/api";
import { notFoundMarkdown, renderMarkdown } from "@/lib/markdown";
import { markdownUrl } from "@/lib/markdown-negotiation";

/**
 * Markdown for AI agents. The proxy rewrites here for `Accept:
 * text/markdown` and `<path>.md` (see lib/markdown.ts); `?md=url` marks a
 * `.md` request so redirects stay on `.md` URLs.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ teamId: string; path?: string[] }> },
) {
  const { teamId, path: segments = [] } = await params;
  const path = `/${segments.join("/")}`;
  const headers = { "content-type": "text/markdown; charset=utf-8" };
  const markdown = await renderMarkdown(teamId, path);
  if (markdown) return new Response(markdown, { headers });

  // Redirects from site.json only apply where no page exists.
  const settings = await getSettings(teamId);
  const match = settings?.redirects?.find(
    (redirect) => (redirect.from.replace(/\/+$/, "") || "/") === path,
  );
  if (match) {
    const viaUrl = new URL(request.url).searchParams.get("md") === "url";
    const location =
      viaUrl && match.to.startsWith("/") ? markdownUrl(match.to) : match.to;
    return new Response(null, {
      status: match.permanent === false ? 307 : 308,
      headers: { location },
    });
  }
  return new Response(notFoundMarkdown(path), { status: 404, headers });
}
