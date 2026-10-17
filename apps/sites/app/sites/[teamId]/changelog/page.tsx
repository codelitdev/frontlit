import type { Metadata } from "next";
import { SiteChrome } from "@/components/site-chrome";

interface Props {
  params: Promise<{ teamId: string }>;
}

export function generateMetadata(): Metadata {
  return {
    title: "Changelog",
    alternates: {
      types: { "application/rss+xml": "/changelog/rss.xml" },
    },
  };
}

export default async function ChangelogPage({ params }: Props) {
  const { teamId } = await params;
  return <SiteChrome teamId={teamId} pageSlug="changelog" />;
}
