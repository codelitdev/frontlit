import type { Metadata } from "next";
import { SiteChrome } from "@/components/site-chrome";

interface Props {
  params: Promise<{ teamId: string }>;
}

export function generateMetadata(): Metadata {
  return {
    title: "Blog",
    alternates: { types: { "application/rss+xml": "/blog/rss.xml" } },
  };
}

export default async function BlogIndexPage({ params }: Props) {
  const { teamId } = await params;
  return <SiteChrome teamId={teamId} pageSlug="blog" />;
}
