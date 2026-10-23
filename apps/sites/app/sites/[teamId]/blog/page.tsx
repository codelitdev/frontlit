import type { Metadata } from "next";
import { SiteChrome } from "@/components/site-chrome";
import { getCanonicalHost } from "@/lib/request-host";

interface Props {
  params: Promise<{ teamId: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Blog",
    alternates: {
      canonical: `https://${await getCanonicalHost()}/blog`,
      types: { "application/rss+xml": "/blog/rss.xml" },
    },
  };
}

export default async function BlogIndexPage({ params }: Props) {
  const { teamId } = await params;
  return <SiteChrome teamId={teamId} pageSlug="blog" />;
}
