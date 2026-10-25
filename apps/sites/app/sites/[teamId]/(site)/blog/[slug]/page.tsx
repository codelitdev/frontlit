import type { Metadata, ResolvingMetadata } from "next";
import { notFound } from "next/navigation";
import {
  BUILD_TEAM_ID,
  getArticleBySlug,
  getCanonicalHost,
  getSettings,
} from "@/lib/api";
import { resolveSeo } from "@/lib/seo";
import { blogPostingJsonLd, serializeJsonLd } from "@/lib/json-ld";
import { SiteChrome } from "@/components/site-chrome";
import { ThemedBlogPost } from "@/components/themed-document";

interface Props {
  params: Promise<{ teamId: string; slug: string }>;
}

export function generateStaticParams() {
  return [{ slug: BUILD_TEAM_ID }];
}

export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { teamId, slug } = await params;
  const [post, settings, previous] = await Promise.all([
    getArticleBySlug(teamId, slug),
    getSettings(teamId),
    parent,
  ]);
  if (!post) return {};

  const seo = resolveSeo(
    {
      title: post.title,
      description: post.excerpt,
      image: post.featuredImage,
    },
    settings,
    previous.title?.absolute || "Website",
  );

  const url = `https://${await getCanonicalHost(teamId)}/blog/${slug}`;
  const index = seo.robotsIndex && !settings?.hideFromSearch;
  return {
    title: seo.title,
    description: seo.description ?? undefined,
    alternates: { canonical: url },
    openGraph: {
      url,
      type: "article",
      title: seo.title,
      description: seo.description ?? undefined,
      images: seo.imageUrl ? [{ url: seo.imageUrl }] : undefined,
      publishedTime: post.publishedAt ?? undefined,
      modifiedTime: post.updatedAt ?? undefined,
    },
    robots: { index, follow: index },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { teamId, slug } = await params;
  const post = await getArticleBySlug(teamId, slug);
  if (!post) notFound();

  const canonicalHost = await getCanonicalHost(teamId);
  const url = `https://${canonicalHost}/blog/${slug}`;

  return (
    <SiteChrome teamId={teamId}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            blogPostingJsonLd({
              title: post.title ?? slug,
              excerpt: post.excerpt,
              imageUrl: (post.featuredImage?.url as string | undefined) ?? null,
              publishedAt: post.publishedAt,
              updatedAt: post.updatedAt,
              authorName: null,
              url,
            }),
          ),
        }}
      />
      <ThemedBlogPost
        teamId={teamId}
        title={post.title}
        publishedAt={post.publishedAt}
        content={post.content}
        featuredImage={post.featuredImage}
      />
    </SiteChrome>
  );
}
