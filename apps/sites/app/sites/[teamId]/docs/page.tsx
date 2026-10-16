import type { Metadata } from "next";
import { SiteChrome } from "@/components/site-chrome";

interface Props {
  params: Promise<{ teamId: string }>;
}

export function generateMetadata(): Metadata {
  return { title: "Docs" };
}

export default async function DocsIndexPage({ params }: Props) {
  const { teamId } = await params;
  return <SiteChrome teamId={teamId} pageSlug="docs" />;
}
