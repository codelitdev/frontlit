import type { Metadata, ResolvingMetadata } from "next";
import { SiteChrome } from "@/components/site-chrome";
import { getCanonicalHost, getPageBySlug, getSettings } from "@/lib/api";
import { pageMetadata } from "@/lib/seo";

interface Props {
  params: Promise<{ teamId: string }>;
}

export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { teamId } = await params;
  const [page, settings, previous, host] = await Promise.all([
    getPageBySlug(teamId, "blog"),
    getSettings(teamId),
    parent,
    getCanonicalHost(teamId),
  ]);
  const metadata = pageMetadata({
    page,
    settings,
    siteName: previous.title?.absolute || "Website",
    url: `https://${host}/blog`,
    fallbackName: "Blog",
  });
  return {
    ...metadata,
    alternates: {
      ...metadata.alternates,
      types: { "application/rss+xml": "/blog/rss.xml" },
    },
  };
}

export default async function BlogIndexPage({ params }: Props) {
  const { teamId } = await params;
  return <SiteChrome teamId={teamId} pageSlug="blog" />;
}
