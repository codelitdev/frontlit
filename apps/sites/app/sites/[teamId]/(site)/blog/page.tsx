import type { Metadata } from "next";
import { SiteChrome } from "@/components/site-chrome";
import { getCanonicalHost } from "@/lib/api";

interface Props {
  params: Promise<{ teamId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { teamId } = await params;
  return {
    title: "Blog",
    alternates: {
      canonical: `https://${await getCanonicalHost(teamId)}/blog`,
      types: { "application/rss+xml": "/blog/rss.xml" },
    },
  };
}

export default async function BlogIndexPage({ params }: Props) {
  const { teamId } = await params;
  return <SiteChrome teamId={teamId} pageSlug="blog" />;
}
