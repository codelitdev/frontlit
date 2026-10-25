import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, resolve, relative, extname, sep, join } from "node:path";
import { parsePageFile, parseSiteFile } from "@frontlit/page-builder/schema";

const imageTypes = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif", ".svg"]);
export function repositoryRoot(folder) {
  for (let dir = folder; ; dir = dirname(dir)) {
    if (existsSync(join(dir, ".git"))) return dir;
    if (dirname(dir) === dir) return dirname(folder);
  }
}
export function localAsset(root, path) {
  const file = realpathSync(resolve(root, path));
  const rel = relative(realpathSync(root), file);
  if (
    rel === ".." ||
    rel.startsWith(`..${sep}`) ||
    !imageTypes.has(extname(file).toLowerCase())
  )
    throw new Error("Asset must be an image inside the repository.");
  return file;
}
function media(value, owner, root) {
  if (Array.isArray(value)) return value.map((v) => media(v, owner, root));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, v]) => {
      if (key === "url" && typeof v === "string" && !/^https:\/\//i.test(v)) {
        const file = localAsset(
          root,
          v.startsWith("/") ? v.slice(1) : relative(root, resolve(dirname(owner), v)),
        );
        return [
          key,
          "/__frontlit/assets/" +
            relative(root, file).split(sep).map(encodeURIComponent).join("/"),
        ];
      }
      return [key, media(v, owner, root)];
    }),
  );
}
// The client renders fixtures directly, so reject shapes it would crash on.
function feedFixtures(feeds, contextFile) {
  if (feeds === undefined) return {};
  const fail = (where) => {
    throw new Error(
      `${contextFile}: ${where} must be an array of { "title", "href", "description" } strings, keyed by route.`,
    );
  };
  if (!feeds || typeof feeds !== "object" || Array.isArray(feeds)) fail("feeds");
  for (const [route, entries] of Object.entries(feeds)) {
    if (!Array.isArray(entries)) fail(`feeds["${route}"]`);
    entries.forEach((entry, i) => {
      if (
        !entry ||
        typeof entry !== "object" ||
        Array.isArray(entry) ||
        ["title", "href", "description"].some(
          (key) => entry[key] !== undefined && typeof entry[key] !== "string",
        )
      )
        fail(`feeds["${route}"][${i}]`);
    });
  }
  return feeds;
}
export function loadSite(
  folder,
  pathname = "/",
  contextFile = join(folder, "preview.context.json"),
) {
  const root = repositoryRoot(folder);
  const slug = decodeURIComponent(pathname).replace(/^\/+|\/+$/g, "");
  if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
    throw new Error(
      `No local page for ${pathname}. Only pages/*.json routes are previewed.`,
    );
  const file = join(folder, "pages", `${slug || "index"}.json`);
  if (!existsSync(file)) throw new Error(`Page not found: ${file}`);
  const context = existsSync(contextFile)
    ? JSON.parse(readFileSync(contextFile, "utf8"))
    : {};
  const siteFile = join(folder, "site.json");
  const site = existsSync(siteFile)
    ? parseSiteFile(readFileSync(siteFile, "utf8"))
    : {};
  const fallback = parseSiteFile(context.site ?? {});
  const effective = { ...fallback, ...site };
  const page = parsePageFile(readFileSync(file, "utf8"));
  const instance = (name, settings, index) => ({
    name,
    settings,
    widgetId: `preview-${index}`,
    shared: name === "header" || name === "footer",
    deletable: false,
    moveable: false,
  });
  const layout = [
    instance(
      "header",
      media(
        site.header ?? fallback.header ?? { links: [], ctaLabel: "", ctaHref: "" },
        site.header ? siteFile : contextFile,
        root,
      ),
      "header",
    ),
    ...page.layout.map((b, i) =>
      instance(b.name, media(b.settings ?? {}, file, root), i),
    ),
    instance(
      "footer",
      media(
        site.footer ??
          fallback.footer ?? { columns: [], tagline: "", copyrightText: "" },
        site.footer ? siteFile : contextFile,
        root,
      ),
      "footer",
    ),
  ];
  const branding = media(context.branding ?? {}, contextFile, root);
  return {
    title: page.title ?? (slug || "Local preview"),
    layout,
    themeStyle: effective.theme ?? null,
    themeId: context.themeId ?? null,
    pageData: {
      siteTitle: branding.title ?? "Local preview",
      siteSubtitle: branding.subtitle ?? null,
      siteLogoUrl: branding.logo?.url ?? null,
      siteLogoAlt: branding.logo?.alt ?? null,
      pageSlug: slug,
    },
    pages: readdirSync(join(folder, "pages"))
      .filter((f) => /^(index|[a-z0-9]+(?:-[a-z0-9]+)*)\.json$/.test(f))
      .map((f) => ({
        path: f === "index.json" ? "/" : "/" + f.slice(0, -5),
        name: f.slice(0, -5),
      })),
    feeds: feedFixtures(context.feeds, contextFile),
    missingBranding: !branding.title,
  };
}
