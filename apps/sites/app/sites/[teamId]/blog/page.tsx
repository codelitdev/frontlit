import type { Metadata, ResolvingMetadata } from "next";
import { SiteChrome } from "@/components/site-chrome";

interface Props {
  params: Promise<{ teamId: string }>;
}

export async function generateMetadata(
  _props: Props,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const previous = await parent;
  return {
    title: `Blog | ${previous.title?.absolute}`,
    alternates: { types: { "application/rss+xml": "/blog/rss.xml" } },
  };
}

export default async function BlogIndexPage({ params }: Props) {
  const { teamId } = await params;
  return <SiteChrome teamId={teamId} pageSlug="blog" />;
}
