import type { Metadata, ResolvingMetadata } from "next";
import { notFound } from "next/navigation";
import { extractDocHeadings } from "@/lib/extract-doc-headings";
import {
  BUILD_TEAM_ID,
  getApiOperation,
  getApiReference,
  getCanonicalHost,
  getDocumentationBySlug,
  getSettings,
} from "@/lib/api";
import { resolveSeo } from "@/lib/seo";
import { serializeJsonLd, techArticleJsonLd } from "@/lib/json-ld";
import { API_PUBLIC_URL } from "@/lib/config";
import { SiteChrome } from "@/components/site-chrome";
import { ThemedDocArticle } from "@/components/themed-docs";
import {
  ThemedApiLanding,
  ThemedApiOperation,
} from "@/components/api-reference/api-reference";
import { API_REFERENCE_LABEL, collectionHref, loadDocsTree } from "@/lib/docs-tree";

interface Props {
  params: Promise<{ teamId: string; slug: string[] }>;
}

export function generateStaticParams() {
  return [{ slug: [BUILD_TEAM_ID] }];
}

/** Paths under the API reference's mount belong to it, not to docs pages. */
async function apiTarget(teamId: string, slug: string) {
  const reference = await getApiReference(teamId);
  if (!reference) return null;
  if (slug === reference.mount) return { reference, operation: null };
  if (!slug.startsWith(`${reference.mount}/`)) return null;
  const found = await getApiOperation(teamId, slug);
  return { reference, operation: found?.operation ?? null, missing: !found };
}

async function apiMetadata(
  teamId: string,
  slug: string,
  title: string,
  description: string | undefined,
): Promise<Metadata> {
  const settings = await getSettings(teamId);
  const url = `https://${await getCanonicalHost(teamId)}/docs/${slug}`;
  const index = !settings?.hideFromSearch;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { url, title, description },
    robots: { index, follow: index },
  };
}

export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { teamId, slug: segments } = await params;
  const slug = segments.join("/");
  const api = await apiTarget(teamId, slug);
  if (api) {
    if (!api.operation)
      return api.missing
        ? {}
        : apiMetadata(
            teamId,
            slug,
            `${API_REFERENCE_LABEL} – ${api.reference.info.title}`,
            undefined,
          );
    const text =
      api.operation.description?.kind === "text"
        ? api.operation.description.text
        : undefined;
    return apiMetadata(
      teamId,
      slug,
      `${api.operation.title} – ${API_REFERENCE_LABEL}`,
      text?.slice(0, 200) ??
        `${api.operation.method.toUpperCase()} ${api.operation.path}`,
    );
  }
  const [doc, settings, previous] = await Promise.all([
    getDocumentationBySlug(teamId, slug),
    getSettings(teamId),
    parent,
  ]);
  if (!doc) return {};

  const seo = resolveSeo(
    {
      title: doc.title,
      description: doc.excerpt,
      image: doc.featuredImage,
    },
    settings,
    previous.title?.absolute || "Website",
  );

  const url = `https://${await getCanonicalHost(teamId)}/docs/${slug}`;
  const index = seo.robotsIndex && !settings?.hideFromSearch;
  return {
    title: seo.title,
    description: seo.description ?? undefined,
    alternates: { canonical: url },
    openGraph: {
      url,
      title: seo.title,
      description: seo.description ?? undefined,
      images: seo.imageUrl ? [{ url: seo.imageUrl }] : undefined,
    },
    robots: { index, follow: index },
  };
}

export default async function DocPage({ params }: Props) {
  const { teamId, slug: segments } = await params;
  const slug = segments.join("/");
  const api = await apiTarget(teamId, slug);
  if (api) {
    if (api.missing) notFound();
    const collections = await loadDocsTree(teamId);
    return (
      <SiteChrome teamId={teamId}>
        {api.operation ? (
          <ThemedApiOperation
            reference={api.reference}
            operation={api.operation}
            route={slug}
            collections={collections}
            teamId={teamId}
            publicApiBaseUrl={API_PUBLIC_URL}
          />
        ) : (
          <ThemedApiLanding
            reference={api.reference}
            collections={collections}
            teamId={teamId}
            publicApiBaseUrl={API_PUBLIC_URL}
          />
        )}
      </SiteChrome>
    );
  }
  const [doc, collections] = await Promise.all([
    getDocumentationBySlug(teamId, slug),
    loadDocsTree(teamId),
  ]);
  if (!doc) notFound();

  const canonicalHost = await getCanonicalHost(teamId);
  const headings = doc.content ? extractDocHeadings(doc.content) : [];
  const collection =
    collections.find((item) => item.items.some((entry) => entry.slug === slug)) ?? null;
  const collectionUrl = collection ? collectionHref(collection) : null;

  return (
    <SiteChrome teamId={teamId}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            techArticleJsonLd({
              title: doc.title ?? slug,
              excerpt: doc.excerpt,
              imageUrl: (doc.featuredImage?.url as string | undefined) ?? null,
              publishedAt: doc.publishedAt,
              updatedAt: doc.updatedAt,
              url: `https://${canonicalHost}/docs/${slug}`,
              breadcrumb: [
                {
                  name: "Help Center",
                  url: `https://${canonicalHost}/docs`,
                },
                ...(collection && collectionUrl
                  ? [
                      {
                        name: collection.name,
                        url: `https://${canonicalHost}${collectionUrl}`,
                      },
                    ]
                  : []),
                {
                  name: doc.title ?? slug,
                  url: `https://${canonicalHost}/docs/${slug}`,
                },
              ],
            }),
          ),
        }}
      />
      <ThemedDocArticle
        title={doc.title}
        content={doc.content}
        featuredImage={doc.featuredImage}
        headings={headings}
        collections={collections}
        currentSlug={slug}
        collection={collection}
        teamId={teamId}
        publicApiBaseUrl={API_PUBLIC_URL}
      />
    </SiteChrome>
  );
}
