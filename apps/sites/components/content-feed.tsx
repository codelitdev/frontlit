import type { DataSlotLoader } from "@frontlit/page-builder/data-slots";
import { getSettings, listArticles, listProductUpdates } from "@/lib/api";
import { getCanonicalHost } from "@/lib/request-host";
import { changelogJsonLd, serializeJsonLd } from "@/lib/json-ld";
import {
  ThemedArticleFeed,
  ThemedProductUpdatesFeed,
} from "@/components/themed-content-feed";
import { ThemedDocumentationFeed } from "@/components/themed-docs";
import { loadDocsTree } from "@/lib/docs-tree";

export const CONTENT_FEED_SOURCES = [
  "articles",
  "documentation",
  "product-updates",
] as const;
export type ContentFeedSource = (typeof CONTENT_FEED_SOURCES)[number];

/** Name stored by FrontLit's standard content pages in the generic data slot. */
export const FRONTLIT_CONTENT_FEED_SLOT = "frontlit.content-feed";

export function isContentFeedSource(value: unknown): value is ContentFeedSource {
  return CONTENT_FEED_SOURCES.includes(value as ContentFeedSource);
}

async function ArticleFeed({ teamId }: { teamId: string }) {
  const [settings, { items }] = await Promise.all([
    getSettings(teamId),
    listArticles(teamId, { itemsPerPage: 50 }),
  ]);

  return (
    <ThemedArticleFeed
      title={settings?.title ? `${settings.title} Blog` : "Blog"}
      subtitle={settings?.subtitle}
      items={items}
    />
  );
}

async function DocumentationFeed({
  teamId,
  publicApiBaseUrl,
}: {
  teamId: string;
  publicApiBaseUrl?: string;
}) {
  const [settings, collections] = await Promise.all([
    getSettings(teamId),
    loadDocsTree(teamId),
  ]);

  return (
    <ThemedDocumentationFeed
      title="Help Center"
      subtitle={settings?.subtitle}
      collections={collections}
      teamId={teamId}
      publicApiBaseUrl={publicApiBaseUrl}
    />
  );
}

async function ProductUpdatesFeed({ teamId }: { teamId: string }) {
  const [settings, { items }, canonicalHost] = await Promise.all([
    getSettings(teamId),
    listProductUpdates(teamId, { itemsPerPage: 100 }),
    getCanonicalHost(),
  ]);

  return (
    <ThemedProductUpdatesFeed
      title="Changelog"
      subtitle={settings?.subtitle}
      jsonLd={serializeJsonLd(
        changelogJsonLd({
          siteName: settings?.title || "FrontLit site",
          url: `https://${canonicalHost}/changelog`,
          entries: items.map((entry) => ({
            name: entry.title ?? entry.slug,
            url: `https://${canonicalHost}/changelog`,
          })),
        }),
      )}
      items={items}
    />
  );
}

export function ContentFeed({
  teamId,
  source,
  publicApiBaseUrl,
}: {
  teamId: string;
  source: ContentFeedSource;
  publicApiBaseUrl?: string;
}) {
  if (source === "articles") return <ArticleFeed teamId={teamId} />;
  if (source === "documentation") {
    return <DocumentationFeed teamId={teamId} publicApiBaseUrl={publicApiBaseUrl} />;
  }
  return <ProductUpdatesFeed teamId={teamId} />;
}

/**
 * FrontLit's application-owned implementation of the page-builder data-slot
 * contract. Other applications can provide different loaders for their own
 * slot names without importing FrontLit's content model.
 */
export const frontlitContentFeedLoader: DataSlotLoader = ({ instance, pageData }) => {
  const source = instance.settings?.source;
  if (!pageData.teamId || !isContentFeedSource(source)) return null;
  return (
    <ContentFeed
      teamId={pageData.teamId}
      source={source}
      publicApiBaseUrl={
        typeof pageData.publicApiBaseUrl === "string"
          ? pageData.publicApiBaseUrl
          : undefined
      }
    />
  );
};
