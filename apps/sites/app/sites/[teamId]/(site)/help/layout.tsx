import { SiteChrome } from "@/components/site-chrome";

export default async function HelpLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  return <SiteChrome teamId={teamId}>{children}</SiteChrome>;
}
