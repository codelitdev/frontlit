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
    getPageBySlug(teamId, "docs"),
    getSettings(teamId),
    parent,
    getCanonicalHost(teamId),
  ]);
  const metadata = pageMetadata({
    page,
    settings,
    siteName: previous.title?.absolute || "Website",
    url: `https://${host}/docs`,
    fallbackName: "Docs",
  });
  return metadata;
}

export default async function DocsIndexPage({ params }: Props) {
  const { teamId } = await params;
  return <SiteChrome teamId={teamId} pageSlug="docs" />;
}
