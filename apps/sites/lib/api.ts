import { cacheLife, cacheTag } from "next/cache";
import { initClient } from "@ts-rest/core";
import {
  contract,
  type ApiOperationSlice,
  type ApiReferenceInfo,
} from "@frontlit/api-contract";
import type { TextEditorContent } from "@frontlit/text-editor";
import type { WidgetInstance } from "@frontlit/page-builder/models";
import { API_URL } from "./config";

/**
 * Server-only client over the API's unauthenticated `/public/*` surface
 * (architecture.md §5.4/§12). Unlike apps/web's browser-facing BFF proxy,
 * apps/sites has no session to forward — every request goes straight to
 * `apps/api`, since these reads are published-only and safe to expose.
 */
const client = initClient(contract.public, {
  baseUrl: API_URL,
  baseHeaders: {},
});

/**
 * Published-content reads are cached (docs/site-delivery.md §4): each one
 * is a `"use cache"` function tagged with the families below, and the
 * signed revalidate webhook expires those tags when content changes. The
 * `site` cacheLife profile (next.config.mjs) is only a safety net for a
 * lost invalidation. Pages inherit the tags of the reads they make.
 */
export const siteTags = {
  team: (teamId: string) => `team:${teamId}`,
  shell: (teamId: string) => `shell:${teamId}`,
  page: (teamId: string, slug: string) => `page:${teamId}:${slug}`,
  docs: (teamId: string) => `docs:${teamId}`,
  blog: (teamId: string) => `blog:${teamId}`,
  changelog: (teamId: string) => `changelog:${teamId}`,
  sitemap: (teamId: string) => `sitemap:${teamId}`,
};

function cached(teamId: string, ...tags: string[]) {
  // Without the webhook secret nothing invalidates the cache, so entries
  // refresh every minute instead.
  if (process.env.REVALIDATE_WEBHOOK_SECRET) cacheLife("site");
  else cacheLife("siteUnmanaged");
  cacheTag(siteTags.team(teamId), ...tags);
}

/**
 * Routes under `/sites/[teamId]` prerender this placeholder at build time
 * (`generateStaticParams` needs one value). It never reaches the API, so a
 * build needs no running backend; real teams render on first request.
 */
export const BUILD_TEAM_ID = "_build";

/** Build-time placeholders (`_build`, and the `-` Next uses for route
 * handlers it prerenders) are never real teams: public team IDs always look
 * like `team_…`. Cached reads skip the API for them, so `next build` works
 * without a backend. */
function isPlaceholderTeam(teamId: string): boolean {
  return !/^team_[a-z0-9]+$/.test(teamId);
}

async function unwrapOrNull<T>(
  promise: Promise<{ status: number; body: unknown }>,
): Promise<T | null> {
  const result = await promise;
  if (result.status >= 200 && result.status < 300) return result.body as T;
  if (result.status === 404) return null;
  throw new Error(
    `Public API request failed (${result.status}): ${JSON.stringify(result.body)}`,
  );
}

export interface ResolvedHost {
  teamId: string;
  canonicalHost: string;
  /** True when this host should 301 to `canonicalHost`. */
  redirect: boolean;
  hideFromSearch: boolean;
  /** Set for a redirect domain: where its paths go on `canonicalHost`. */
  redirectTo?: { pathPrefix: string; rules: { from: string; to: string }[] };
}

export function resolveHost(host: string): Promise<ResolvedHost | null> {
  return unwrapOrNull(client.resolveHost({ query: { host } }));
}

export interface PublicSettings {
  title: string | null;
  subtitle: string | null;
  logo: Record<string, unknown> | null;
  themeId: string | null;
  theme: Record<string, unknown> | null;
  codeInjectionHead: string | null;
  codeInjectionBody: string | null;
  redirects?: { from: string; to: string; permanent?: boolean }[];
  /** Host links, canonical URLs and feeds point at. */
  canonicalHost: string | null;
  /** Pre-launch: noindex everywhere, robots disallow all. */
  hideFromSearch: boolean;
}

export async function getSettings(teamId: string): Promise<PublicSettings | null> {
  "use cache";
  cached(teamId, siteTags.shell(teamId));
  if (isPlaceholderTeam(teamId)) return null;
  return unwrapOrNull(client.getSettings({ params: { teamId } }));
}

/** A signed preview release's settings (its own theme). Never cached. */
export function getPreviewSettings(
  teamId: string,
  preview: { release: string; token: string },
): Promise<PublicSettings | null> {
  return unwrapOrNull(
    client.getSettings({
      params: { teamId },
      query: preview,
      fetchOptions: { cache: "no-store" },
    }),
  );
}

/** The host canonical URLs use. Falls back to `localhost` only for a site
 * that has no public host (it can't be reached anyway). */
export async function getCanonicalHost(teamId: string): Promise<string> {
  return (await getSettings(teamId))?.canonicalHost ?? "localhost";
}

export interface PublicPage {
  pageId: string;
  name: string;
  slug: string;
  layout: WidgetInstance[];
  title: string | null;
  description: string | null;
  socialImage: Record<string, unknown> | null;
  robotsAllowed: boolean | null;
  publishedAt: string | null;
  updatedAt: string | null;
}

/** Pass `""` (or omit) to resolve the homepage. Pages carry the shell tag
 * too: the API hydrates the published header and footer into each one. */
export async function getPageBySlug(
  teamId: string,
  slug: string = "",
): Promise<PublicPage | null> {
  "use cache";
  cached(teamId, siteTags.page(teamId, slug), siteTags.shell(teamId));
  if (isPlaceholderTeam(teamId)) return null;
  return unwrapOrNull(client.getPageBySlug({ params: { teamId }, query: { slug } }));
}

/** The shared header and footer, for routes that wrap their own content
 * (docs articles, blog posts). Read from the homepage, which always carries
 * them, but cached under the shell tag only: publishing the homepage's own
 * content doesn't touch these routes. */
export async function getSiteChrome(teamId: string): Promise<WidgetInstance[]> {
  "use cache";
  cached(teamId, siteTags.shell(teamId));
  if (isPlaceholderTeam(teamId)) return [];
  const home = await unwrapOrNull<PublicPage>(
    client.getPageBySlug({ params: { teamId }, query: { slug: "" } }),
  );
  return (home?.layout ?? []).filter(
    (widget) => widget.name === "header" || widget.name === "footer",
  );
}

/** A page from a signed pull request preview release (never cached). */
export function getPreviewPage(
  teamId: string,
  release: string,
  token: string,
  slug: string = "",
): Promise<PublicPage | null> {
  return unwrapOrNull(
    client.getPageBySlug({
      params: { teamId },
      query: { slug, release, token },
      fetchOptions: { cache: "no-store" },
    }),
  );
}

export interface SitemapEntry {
  kind: "page" | "blog" | "doc" | "changelog";
  path: string;
  lastmod: string | null;
}

export async function getSitemap(teamId: string): Promise<SitemapEntry[]> {
  "use cache";
  cached(teamId, siteTags.sitemap(teamId));
  if (isPlaceholderTeam(teamId)) return [];
  const result = await unwrapOrNull<{ items: SitemapEntry[] }>(
    client.getSitemap({ params: { teamId } }),
  );
  return result?.items ?? [];
}

export type ChatbotWidgetVariant = "bubble" | "text_input";
export type ChatbotWidgetStyle = {
  bubbleShape: "circle" | "rounded" | "square";
  bubbleIcon: "chat" | "message" | "sparkles" | "bot";
  bubbleSize: "sm" | "md" | "lg";
  inputRadius: "none" | "sm" | "md" | "lg" | "full";
  inputPlaceholder: string | null;
  inputWidth: "sm" | "md" | "lg";
};

export interface PublicChatbotSettings {
  enabled: boolean;
  name: string;
  greeting: string | null;
  accentColor: string | null;
  variant: ChatbotWidgetVariant;
  widgetStyle: ChatbotWidgetStyle;
}

export async function getChatbotSettings(
  teamId: string,
): Promise<PublicChatbotSettings | null> {
  "use cache";
  cached(teamId, siteTags.shell(teamId));
  if (isPlaceholderTeam(teamId)) return null;
  return unwrapOrNull(client.getChatbotSettings({ params: { teamId } }));
}

export interface PublicDocument<M> {
  documentId: string;
  slug: string;
  title: string | null;
  content: TextEditorContent | null;
  excerpt: string | null;
  featuredImage: Record<string, unknown> | null;
  meta: M;
  publishedAt: string | null;
  updatedAt: string | null;
}

export interface ArticleMeta {
  tags: string[];
  seo?: { title?: string; description?: string };
}

export async function listArticles(
  teamId: string,
  params: { offset?: number; itemsPerPage?: number } = {},
): Promise<{ items: PublicDocument<ArticleMeta>[]; total: number }> {
  "use cache";
  cached(teamId, siteTags.blog(teamId));
  if (isPlaceholderTeam(teamId)) return { items: [], total: 0 };
  const result = await unwrapOrNull<{
    items: PublicDocument<ArticleMeta>[];
    total: number;
  }>(client.listArticles({ params: { teamId }, query: params }));
  return result ?? { items: [], total: 0 };
}

export async function getArticleBySlug(
  teamId: string,
  slug: string,
): Promise<PublicDocument<ArticleMeta> | null> {
  "use cache";
  cached(teamId, siteTags.blog(teamId));
  if (isPlaceholderTeam(teamId)) return null;
  return unwrapOrNull(client.getArticleBySlug({ params: { teamId, slug } }));
}

export interface DocumentationMeta {
  frontmatter?: Record<string, unknown>;
  sectionId?: string;
  order: number;
  seo?: { title?: string; description?: string };
}

export interface DocumentationSection {
  sectionId: string;
  name: string;
  slug: string;
  order: number;
}

export interface DocumentationSnapshot {
  publicationId: string | null;
  policyEpoch: number;
  items: PublicDocument<DocumentationMeta>[];
  sections: DocumentationSection[];
}
const EMPTY_DOCS: DocumentationSnapshot = {
  publicationId: null,
  policyEpoch: 0,
  items: [],
  sections: [],
};

/** One publication snapshot per render, so a docs page's body, navigation
 * and collections always agree (docs-management.md §23.3). */
export async function getDocumentationSnapshot(
  teamId: string,
): Promise<DocumentationSnapshot> {
  "use cache";
  cached(teamId, siteTags.docs(teamId));
  if (isPlaceholderTeam(teamId)) return EMPTY_DOCS;
  const result = await unwrapOrNull<DocumentationSnapshot>(
    client.getDocumentationSnapshot({ params: { teamId }, query: {} }),
  );
  return result ?? EMPTY_DOCS;
}
export async function listDocumentationSections(
  teamId: string,
): Promise<DocumentationSection[]> {
  return (await getDocumentationSnapshot(teamId)).sections;
}
export async function listDocumentation(
  teamId: string,
  params: { offset?: number; itemsPerPage?: number } = {},
): Promise<{ items: PublicDocument<DocumentationMeta>[]; total: number }> {
  const live = await getDocumentationSnapshot(teamId);
  const start = ((params.offset ?? 1) - 1) * (params.itemsPerPage ?? 20);
  return {
    items: live.items.slice(start, start + (params.itemsPerPage ?? 20)),
    total: live.items.length,
  };
}
export async function getDocumentationBySlug(
  teamId: string,
  slug: string,
): Promise<PublicDocument<DocumentationMeta> | null> {
  return (
    (await getDocumentationSnapshot(teamId)).items.find((doc) => doc.slug === slug) ??
    null
  );
}

export type PublicApiReference = {
  mount: string;
  commitSha: string;
  info: ApiReferenceInfo;
  groups: {
    name: string;
    operations: {
      route: string;
      title: string;
      method: string;
      path: string;
      deprecated: boolean;
    }[];
  }[];
};
/** The live API reference (docs/openapi-support.md). Cached like docs under
 * `docs:<team>`; the API's activation event expires the tag. */
export async function getApiReference(
  teamId: string,
): Promise<PublicApiReference | null> {
  "use cache";
  cached(teamId, siteTags.docs(teamId));
  if (isPlaceholderTeam(teamId)) return null;
  return unwrapOrNull<PublicApiReference>(
    client.getApiReference({ params: { teamId } }),
  );
}
export async function getApiOperation(
  teamId: string,
  route: string,
): Promise<{ route: string; mount: string; operation: ApiOperationSlice } | null> {
  "use cache";
  cached(teamId, siteTags.docs(teamId));
  if (isPlaceholderTeam(teamId)) return null;
  return unwrapOrNull(client.getApiOperation({ params: { teamId }, query: { route } }));
}
/** The live spec text served at `/openapi.json`, with its content hash. */
export async function getApiSpec(
  teamId: string,
): Promise<{ spec: string; etag: string } | null> {
  "use cache";
  cached(teamId, siteTags.docs(teamId));
  if (isPlaceholderTeam(teamId)) return null;
  const response = await fetch(
    `${API_URL}/public/${encodeURIComponent(teamId)}/content/api-reference/openapi.json`,
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Public API request failed (${response.status})`);
  return { spec: await response.text(), etag: response.headers.get("etag") ?? "" };
}

export interface ProductUpdateMeta {
  version?: string;
  labels: string[];
  releaseDate?: string;
  seo?: { title?: string; description?: string };
}

export async function listProductUpdates(
  teamId: string,
  params: { offset?: number; itemsPerPage?: number } = {},
): Promise<{ items: PublicDocument<ProductUpdateMeta>[]; total: number }> {
  "use cache";
  cached(teamId, siteTags.changelog(teamId));
  if (isPlaceholderTeam(teamId)) return { items: [], total: 0 };
  const result = await unwrapOrNull<{
    items: PublicDocument<ProductUpdateMeta>[];
    total: number;
  }>(client.listProductUpdates({ params: { teamId }, query: params }));
  return result ?? { items: [], total: 0 };
}

export interface TicketMessageSource {
  documentId: string;
  slug: string;
  title: string | null;
  anchor: string | null;
}

export interface TicketMessage {
  messageId: string;
  author: "requester" | "agent" | "bot";
  content: TextEditorContent;
  sources?: TicketMessageSource[];
  createdAt: string | null;
}

export interface TicketThread {
  ticketId: string;
  subject: string;
  status: "open" | "pending" | "resolved" | "closed";
  messages: TicketMessage[];
}

export async function getTicketThread(
  teamId: string,
  ticketId: string,
  token: string,
): Promise<TicketThread | null> {
  // Never cached — a live, token-guarded conversation containing visitor
  // PII (architecture.md §13.4), the opposite of the published-content
  // reads above. 401 is a bad/rotated magic token, not a server failure.
  const result = await client.getTicketThread({
    params: { teamId, ticketId },
    query: { token },
    fetchOptions: { cache: "no-store" },
  });
  if (result.status >= 200 && result.status < 300) {
    return result.body as TicketThread;
  }
  if (result.status === 401 || result.status === 404) return null;
  throw new Error(
    `Public API request failed (${result.status}): ${JSON.stringify(result.body)}`,
  );
}
