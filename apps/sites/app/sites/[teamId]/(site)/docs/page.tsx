import type { Metadata } from "next";
import { SiteChrome } from "@/components/site-chrome";
import { getCanonicalHost } from "@/lib/api";

interface Props {
  params: Promise<{ teamId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { teamId } = await params;
  return {
    title: "Docs",
    alternates: { canonical: `https://${await getCanonicalHost(teamId)}/docs` },
  };
}

export default async function DocsIndexPage({ params }: Props) {
  const { teamId } = await params;
  return <SiteChrome teamId={teamId} pageSlug="docs" />;
}
