import { changelogDate, type ApiRichText } from "@frontlit/api-contract";
import { layoutToMarkdown } from "@frontlit/page-builder/schema";
import { serializeDocsMarkdown } from "@frontlit/text-editor/docs";
import {
  CHANGELOG_PAGE_SIZE,
  getApiOperation,
  getApiReference,
  getArticleBySlug,
  getDocumentationBySlug,
  getPageBySlug,
  getSettings,
  listArticles,
  listProductUpdates,
  type PublicSettings,
  type SitemapEntry,
} from "./api";
import { loadDocsTree } from "./docs-tree";
import { markdownUrl } from "./markdown-negotiation";

/**
 * Markdown versions of public pages for AI agents (`Accept: text/markdown`
 * or `<path>.md`), plus `/llms.txt`. The proxy decides when a request wants
 * Markdown (lib/markdown-negotiation.ts); everything here is keyed by path
 * alone, so it caches like HTML.
 */

/** TipTap JSON → Markdown. Content the docs serializer can't read (rare
 * blog formatting) falls back to its plain text. */
export function tiptapToMarkdown(content: unknown): string {
  if (!content) return "";
  try {
    return serializeDocsMarkdown(content).trim();
  } catch {
    return plainText(content).trim();
  }
}

/** First `max` characters of a TipTap body as one line of plain text, for
 * feed summaries (RSS `<description>`). */
export function plainTextSummary(content: unknown, max = 300): string {
  const text = plainText(content).replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function plainText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const { text, content, type } = node as {
    text?: string;
    content?: unknown[];
    type?: string;
  };
  if (typeof text === "string") return text;
  const inner = (content ?? []).map(plainText).join("");
  return ["paragraph", "heading", "listItem", "codeBlock", "blockquote"].includes(
    type ?? "",
  )
    ? `${inner}\n\n`
    : inner;
}

function richText(value: ApiRichText | undefined): string {
  if (!value) return "";
  return value.kind === "text" ? value.text : tiptapToMarkdown(value.content);
}

const date = (value: string | null | undefined) => (value ? value.slice(0, 10) : "");

function document(title: string, ...parts: (string | null | undefined)[]): string {
  return `${[`# ${title}`, ...parts].filter((part) => part?.trim()).join("\n\n")}\n`;
}

export function notFoundMarkdown(path: string): string {
  return document(
    "Page not found",
    `Nothing is published at \`${path}\`.`,
    "- [llms.txt](/llms.txt): an index of this site's pages, docs and posts\n- [sitemap.xml](/sitemap.xml): every public URL",
  );
}

async function blogIndex(teamId: string) {
  const { items } = await listArticles(teamId, { itemsPerPage: 1000 });
  return items
    .map(
      (post) =>
        `- [${post.title || post.slug}](${markdownUrl(`/blog/${post.slug}`)})${post.publishedAt ? ` (${date(post.publishedAt)})` : ""}${post.excerpt ? `: ${post.excerpt}` : ""}`,
    )
    .join("\n");
}

async function changelogFeed(teamId: string) {
  const { items } = await listProductUpdates(teamId, {
    itemsPerPage: CHANGELOG_PAGE_SIZE,
  });
  return items
    .map((update) => {
      const label = [update.meta.version, changelogDate(update)]
        .filter(Boolean)
        .join(", ");
      return [
        `## ${update.title || update.slug}${label ? ` (${label})` : ""}`,
        tiptapToMarkdown(update.content),
      ]
        .filter(Boolean)
        .join("\n\n");
    })
    .join("\n\n");
}

async function docsIndex(teamId: string) {
  const collections = await loadDocsTree(teamId);
  return collections
    .map((collection) => {
      const items = collection.api
        ? [
            `- [${collection.name}](${markdownUrl(collection.api.href)})`,
            ...collection.api.groups.flatMap((group) =>
              group.items.map(
                (item) =>
                  `- [${item.method ? `${item.method.toUpperCase()} ` : ""}${item.title || item.slug}](${markdownUrl(`/docs/${item.slug}`)})`,
              ),
            ),
          ]
        : collection.items.map(
            (item) =>
              `- [${item.title || item.slug}](${markdownUrl(`/docs/${item.slug}`)})${item.excerpt ? `: ${item.excerpt}` : ""}`,
          );
      return [`## ${collection.name}`, items.join("\n")].join("\n\n");
    })
    .join("\n\n");
}

/** A builder page, with FrontLit's content feed in its slot (or appended
 * when the page doesn't place one). */
async function pageMarkdown(
  teamId: string,
  slug: string,
  fallbackTitle: string,
  feed?: () => Promise<string>,
): Promise<string | null> {
  const page = await getPageBySlug(teamId, slug);
  if (!page && !feed) return null;
  const feedMarkdown = feed ? await feed() : "";
  let placed = false;
  const body = layoutToMarkdown(page?.layout ?? [], () => {
    placed = true;
    return feedMarkdown;
  });
  const settings = await getSettings(teamId);
  const title =
    page?.title || (slug === "" ? settings?.title : page?.name) || fallbackTitle;
  return document(
    title,
    (page?.description ?? (slug === "" ? settings?.subtitle : null))
      ? `> ${page?.description ?? settings?.subtitle}`
      : "",
    body,
    placed ? "" : feedMarkdown,
  );
}

async function docMarkdown(teamId: string, slug: string): Promise<string | null> {
  const reference = await getApiReference(teamId);
  if (reference && slug === reference.mount) {
    return document(
      reference.info.title,
      reference.info.version ? `Version ${reference.info.version}` : "",
      richText(reference.info.description),
      "[OpenAPI spec](/openapi.json)",
      ...reference.groups.map((group) =>
        [
          `## ${group.name}`,
          group.operations
            .map(
              (operation) =>
                `- [${operation.method.toUpperCase()} ${operation.path}](${markdownUrl(`/docs/${operation.route}`)}): ${operation.title}`,
            )
            .join("\n"),
        ].join("\n\n"),
      ),
    );
  }
  if (reference && slug.startsWith(`${reference.mount}/`)) {
    const found = await getApiOperation(teamId, slug);
    if (!found) return null;
    const { operation } = found;
    const parameters = operation.parameters.map(
      (param) =>
        `- \`${param.name}\` (${param.in}${param.required ? ", required" : ""})${param.description ? `: ${param.description}` : ""}`,
    );
    return document(
      operation.title,
      `\`${operation.method.toUpperCase()} ${operation.path}\`${operation.deprecated ? " (deprecated)" : ""}`,
      richText(operation.description),
      parameters.length ? `## Parameters\n\n${parameters.join("\n")}` : "",
      operation.responses.length
        ? `## Responses\n\n${operation.responses
            .map(
              (response) =>
                `- \`${response.status}\`${response.description ? `: ${response.description}` : ""}`,
            )
            .join("\n")}`
        : "",
      "Full schemas: [OpenAPI spec](/openapi.json)",
    );
  }
  const doc = await getDocumentationBySlug(teamId, slug);
  if (!doc) return null;
  return document(
    doc.title || slug,
    doc.excerpt ? `> ${doc.excerpt}` : "",
    tiptapToMarkdown(doc.content),
  );
}

async function collectionMarkdown(teamId: string, sectionSlug: string) {
  const collection = (await loadDocsTree(teamId)).find(
    (item) => item.slug === sectionSlug,
  );
  if (!collection) return null;
  return document(
    collection.name,
    collection.items
      .map(
        (item) =>
          `- [${item.title || item.slug}](${markdownUrl(`/docs/${item.slug}`)})${item.excerpt ? `: ${item.excerpt}` : ""}`,
      )
      .join("\n"),
  );
}

/** The Markdown for a public path, or null when nothing is published there. */
export async function renderMarkdown(
  teamId: string,
  path: string,
): Promise<string | null> {
  const segments = path.split("/").filter(Boolean).map(decodeURIComponent);
  const [first = "", ...rest] = segments;
  if (first === "docs") {
    if (rest.length === 0)
      return pageMarkdown(teamId, "docs", "Docs", () => docsIndex(teamId));
    if (rest[0] === "collections" && rest.length === 2)
      return collectionMarkdown(teamId, rest[1]!);
    return docMarkdown(teamId, rest.join("/"));
  }
  if (first === "blog") {
    if (rest.length === 0)
      return pageMarkdown(teamId, "blog", "Blog", () => blogIndex(teamId));
    if (rest.length > 1) return null;
    const post = await getArticleBySlug(teamId, rest[0]!);
    if (!post) return null;
    return document(
      post.title || post.slug,
      post.publishedAt ? `Published ${date(post.publishedAt)}` : "",
      tiptapToMarkdown(post.content),
    );
  }
  if (first === "changelog" && rest.length === 0)
    return pageMarkdown(teamId, "changelog", "Changelog", () => changelogFeed(teamId));
  return pageMarkdown(teamId, segments.join("/"), segments.at(-1) ?? "Home");
}

/** `/llms.txt` (llmstxt.org): the site's title, summary, agent
 * instructions and links to the Markdown of every public page. Built from
 * the same read as the sitemap, so hidden pages stay out. */
export function buildLlmsTxt(
  settings: PublicSettings | null,
  entries: SitemapEntry[],
  hasOpenApi: boolean,
): string {
  const host = settings?.canonicalHost ?? "localhost";
  const url = (path: string) => `https://${host}${markdownUrl(path)}`;
  const line = (entry: SitemapEntry) =>
    `- [${entry.title || entry.path}](${url(entry.path)})`;
  // A builder page at /changelog also comes back as the changelog entry;
  // list each path once.
  const seen = new Set<string>();
  const of = (kind: SitemapEntry["kind"]) =>
    entries
      .filter((e) => e.kind === kind && !seen.has(e.path) && seen.add(e.path))
      .map(line);
  const sections: [string, string[]][] = [
    ["Pages", of("page")],
    ["Docs", of("doc")],
    ["Blog", of("blog")],
    ["Changelog", of("changelog")],
  ];
  if (hasOpenApi)
    sections.push(["API", [`- [OpenAPI spec](https://${host}/openapi.json)`]]);
  return `${[
    `# ${settings?.title || host}`,
    settings?.subtitle ? `> ${settings.subtitle}` : "",
    settings?.agentInstructions
      ? `## Agent instructions\n\n${settings.agentInstructions}`
      : "",
    ...sections
      .filter(([, lines]) => lines.length)
      .map(([name, lines]) => `## ${name}\n\n${lines.join("\n")}`),
  ]
    .filter(Boolean)
    .join("\n\n")}\n`;
}
