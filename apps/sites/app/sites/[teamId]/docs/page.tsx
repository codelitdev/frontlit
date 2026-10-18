import type { Metadata } from "next";
import { SiteChrome } from "@/components/site-chrome";
import { getCanonicalHost } from "@/lib/request-host";

interface Props {
  params: Promise<{ teamId: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Docs",
    alternates: { canonical: `https://${await getCanonicalHost()}/docs` },
  };
}

export default async function DocsIndexPage({ params }: Props) {
  const { teamId } = await params;
  return <SiteChrome teamId={teamId} pageSlug="docs" />;
}
