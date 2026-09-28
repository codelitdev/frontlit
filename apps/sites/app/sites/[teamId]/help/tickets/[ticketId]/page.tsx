import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTicketThread } from "@/lib/api";
import { API_PUBLIC_URL } from "@/lib/config";
import { SiteChrome } from "@/components/site-chrome";
import { ThemedTicketThread } from "@/components/themed-ticket-thread";

interface Props {
  params: Promise<{ teamId: string; ticketId: string }>;
  searchParams: Promise<{ token?: string }>;
}

// Magic-link thread pages are never indexed or listed in the sitemap
// (architecture.md §13.4) — they contain visitor PII.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function TicketThreadPage({ params, searchParams }: Props) {
  const { teamId, ticketId } = await params;
  const { token } = await searchParams;
  if (!token) notFound();

  const thread = await getTicketThread(teamId, ticketId, token);
  if (!thread) notFound();

  return (
    <SiteChrome teamId={teamId}>
      <ThemedTicketThread
        subject={thread.subject}
        status={thread.status}
        messages={thread.messages}
        apiBaseUrl={API_PUBLIC_URL}
        teamId={teamId}
        ticketId={ticketId}
        token={token}
      />
    </SiteChrome>
  );
}
