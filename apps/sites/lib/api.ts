import { cache } from "react";
import { initClient } from "@ts-rest/core";
import { contract } from "@frontlit/api-contract";
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

/** Every published-content read is tagged `team:<teamId>` and time-bound
 * revalidated (architecture.md §12.2/§13.5 — "ISR + tag revalidation means
 * public traffic mostly never reaches the API"). `revalidateTag` isn't wired
 * to a publish-time webhook yet, so a 60s ceiling bounds staleness in the
 * meantime instead of serving indefinitely-stale content. */
function teamCache(teamId: string) {
  return { next: { revalidate: 60, tags: [`team:${teamId}`] } };
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
}

export function getSettings(teamId: string): Promise<PublicSettings | null> {
  return unwrapOrNull(
    client.getSettings({
      params: { teamId },
      fetchOptions: teamCache(teamId),
    }),
  );
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

/** Pass `""` (or omit) to resolve the homepage. */
export function getPageBySlug(
  teamId: string,
  slug: string = "",
): Promise<PublicPage | null> {
  return unwrapOrNull(
    client.getPageBySlug({
      params: { teamId },
      query: { slug },
      fetchOptions: teamCache(teamId),
    }),
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
  const result = await unwrapOrNull<{ items: SitemapEntry[] }>(
    client.getSitemap({
      params: { teamId },
      fetchOptions: { cache: "no-store" },
    }),
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
  return unwrapOrNull(
    client.getChatbotSettings({
      params: { teamId },
      fetchOptions: teamCache(teamId),
    }),
  );
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
  const result = await unwrapOrNull<{
    items: PublicDocument<ArticleMeta>[];
    total: number;
  }>(
    client.listArticles({
      params: { teamId },
      query: params,
      fetchOptions: teamCache(teamId),
    }),
  );
  return result ?? { items: [], total: 0 };
}

export function getArticleBySlug(
  teamId: string,
  slug: string,
): Promise<PublicDocument<ArticleMeta> | null> {
  return unwrapOrNull(
    client.getArticleBySlug({
      params: { teamId, slug },
      fetchOptions: teamCache(teamId),
    }),
  );
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
// React cache only deduplicates this authoritative read within one render.
export const getDocumentationSnapshot = cache(
  async (teamId: string): Promise<DocumentationSnapshot> => {
    const result = await unwrapOrNull<DocumentationSnapshot>(
      client.getDocumentationSnapshot({
        params: { teamId },
        query: {},
        fetchOptions: { cache: "no-store" },
      }),
    );
    return (
      result ?? {
        publicationId: null,
        policyEpoch: 0,
        items: [],
        sections: [],
      }
    );
  },
);
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
  const result = await unwrapOrNull<{
    items: PublicDocument<ProductUpdateMeta>[];
    total: number;
  }>(
    client.listProductUpdates({
      params: { teamId },
      query: params,
      fetchOptions: teamCache(teamId),
    }),
  );
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
