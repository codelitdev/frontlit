import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TextRenderer } from "@frontlit/text-editor";
import { getTicketThread } from "@/lib/api";
import { API_PUBLIC_URL } from "@/lib/config";
import { CitationList } from "@/components/citation-list";
import { TicketReplyForm } from "@/components/ticket-reply-form";

interface Props {
    params: Promise<{ teamId: string; ticketId: string }>;
    searchParams: Promise<{ token?: string }>;
}

// Magic-link thread pages are never indexed or listed in the sitemap
// (architecture.md §13.4) — they contain visitor PII.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function TicketThreadPage({
    params,
    searchParams,
}: Props) {
    const { teamId, ticketId } = await params;
    const { token } = await searchParams;
    if (!token) notFound();

    const thread = await getTicketThread(teamId, ticketId, token);
    if (!thread) notFound();

    return (
        <main className="mx-auto max-w-2xl px-6 py-16">
            <h1 className="text-2xl font-bold">{thread.subject}</h1>
            <p className="mt-1 text-sm capitalize text-muted-foreground">
                {thread.status}
            </p>

            <ol className="mt-8 flex flex-col gap-6">
                {thread.messages.map((message) => (
                    <li
                        key={message.messageId}
                        className={
                            message.author === "requester"
                                ? ""
                                : "rounded-lg bg-muted p-4"
                        }
                    >
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            {message.author === "requester" ? "You" : "Support"}
                        </p>
                        <div className="prose prose-sm mt-1 max-w-none">
                            <TextRenderer json={message.content} />
                        </div>
                        {message.author === "bot" && (
                            <CitationList sources={message.sources} />
                        )}
                    </li>
                ))}
            </ol>

            {thread.status !== "closed" && (
                <TicketReplyForm
                    apiBaseUrl={API_PUBLIC_URL}
                    teamId={teamId}
                    ticketId={ticketId}
                    token={token}
                />
            )}
        </main>
    );
}
