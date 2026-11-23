/**
 * When a request gets Markdown instead of HTML: a `<path>.md` URL, or an
 * `Accept` header that prefers `text/markdown`. Kept free of imports: a
 * site's proxy runs it on every request.
 */

/** True when the Accept header ranks Markdown at least as high as HTML.
 * Browsers never list `text/markdown`, so they keep getting HTML. */
export function prefersMarkdown(accept: string | null): boolean {
  if (!accept) return false;
  let markdown = 0;
  let html = 0;
  for (const part of accept.split(",")) {
    const [type = "", ...params] = part.split(";").map((value) => value.trim());
    const qParam = params.find((param) => param.startsWith("q="));
    const q = qParam ? Number(qParam.slice(2)) : 1;
    if (Number.isNaN(q)) continue;
    const mediaType = type.toLowerCase();
    if (mediaType === "text/markdown" || mediaType === "text/x-markdown")
      markdown = Math.max(markdown, q);
    else if (mediaType === "text/html") html = Math.max(html, q);
  }
  return markdown > 0 && markdown >= html;
}

/** Paths whose response depends on Accept: pages, not files (`.md` URLs,
 * feeds, assets) or the site's own non-content routes, given as path
 * prefixes such as `/embed`. */
export function isNegotiablePath(pathname: string, excluded: string[] = []): boolean {
  if (/\.[a-z0-9]+$/i.test(pathname)) return false;
  return !excluded.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** `/docs/intro.md` → `/docs/intro`; `/index.md` → `/`. Null when the path
 * isn't a `.md` URL. */
export function markdownSourcePath(pathname: string): string | null {
  if (!pathname.endsWith(".md")) return null;
  const path = pathname.slice(0, -".md".length);
  return path === "/index" || path === "" ? "/" : path;
}

/** The `.md` URL of a public path, for links agents follow. */
export function markdownUrl(path: string): string {
  return path === "/" ? "/index.md" : `${path.replace(/\/+$/, "")}.md`;
}
