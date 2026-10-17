import type { Metadata, ResolvingMetadata } from "next";
import { notFound } from "next/navigation";
import { extractDocHeadings } from "@/lib/extract-doc-headings";
import { getDocumentationBySlug, getSettings } from "@/lib/api";
import { resolveSeo } from "@/lib/seo";
import { getCanonicalHost } from "@/lib/request-host";
import { serializeJsonLd, techArticleJsonLd } from "@/lib/json-ld";
import { API_PUBLIC_URL } from "@/lib/config";
import { SiteChrome } from "@/components/site-chrome";
import { ThemedDocArticle } from "@/components/themed-docs";
import { collectionHref, loadDocsTree } from "@/lib/docs-tree";

interface Props {
  params: Promise<{ teamId: string; slug: string[] }>;
}

export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { teamId, slug: segments } = await params;
  const slug = segments.join("/");
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
    previous.title?.absolute || "FrontLit site",
  );

  return {
    title: seo.title,
    description: seo.description ?? undefined,
    alternates: {
      canonical: `https://${await getCanonicalHost()}/docs/${slug}`,
    },
    openGraph: {
      title: seo.title,
      description: seo.description ?? undefined,
      images: seo.imageUrl ? [{ url: seo.imageUrl }] : undefined,
    },
    robots: { index: seo.robotsIndex, follow: seo.robotsIndex },
  };
}

export default async function DocPage({ params }: Props) {
  const { teamId, slug: segments } = await params;
  const slug = segments.join("/");
  const [doc, collections] = await Promise.all([
    getDocumentationBySlug(teamId, slug),
    loadDocsTree(teamId),
  ]);
  if (!doc) notFound();

  const canonicalHost = await getCanonicalHost();
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
