import type { Metadata } from "next";
import { SiteChrome } from "@/components/site-chrome";
import { getCanonicalHost } from "@/lib/request-host";

interface Props {
  params: Promise<{ teamId: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Changelog",
    alternates: {
      canonical: `https://${await getCanonicalHost()}/changelog`,
      types: { "application/rss+xml": "/changelog/rss.xml" },
    },
  };
}

export default async function ChangelogPage({ params }: Props) {
  const { teamId } = await params;
  return <SiteChrome teamId={teamId} pageSlug="changelog" />;
}
