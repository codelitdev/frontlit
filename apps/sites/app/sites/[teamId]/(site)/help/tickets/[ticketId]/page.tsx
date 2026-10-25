import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BUILD_TEAM_ID, getTicketThread } from "@/lib/api";
import { API_PUBLIC_URL } from "@/lib/config";
import { ThemedTicketThread } from "@/components/themed-ticket-thread";

interface Props {
  params: Promise<{ teamId: string; ticketId: string }>;
  searchParams: Promise<{ token?: string }>;
}

// Magic-link thread pages are never indexed or listed in the sitemap
// (architecture.md §13.4) — they contain visitor PII.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export function generateStaticParams() {
  return [{ ticketId: BUILD_TEAM_ID }];
}

/** The site chrome (help/layout.tsx) is cached; the thread is read per
 * request with the visitor's token and never cached. */
export default function TicketThreadPage(props: Props) {
  return (
    <Suspense fallback={null}>
      <TicketThread {...props} />
    </Suspense>
  );
}

async function TicketThread({ params, searchParams }: Props) {
  const [{ teamId, ticketId }, { token }] = await Promise.all([params, searchParams]);
  if (!token) notFound();

  const thread = await getTicketThread(teamId, ticketId, token);
  if (!thread) notFound();

  return (
    <ThemedTicketThread
      subject={thread.subject}
      status={thread.status}
      messages={thread.messages}
      apiBaseUrl={API_PUBLIC_URL}
      teamId={teamId}
      ticketId={ticketId}
      token={token}
    />
  );
}
