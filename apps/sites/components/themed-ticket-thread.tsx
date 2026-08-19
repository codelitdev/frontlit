"use client";

import { TextRenderer } from "@frontlit/text-editor";
import {
    Caption,
    Header1,
    PageCard,
    PageCardContent,
    Section,
} from "@frontlit/page-builder/primitives";
import { useSiteThemeStyle } from "@/lib/site-theme-context";
import { CitationList } from "@/components/citation-list";
import { TicketReplyForm } from "@/components/ticket-reply-form";
import type { TicketMessage } from "@/lib/api";

export function ThemedTicketThread({
    subject,
    status,
    messages,
    apiBaseUrl,
    teamId,
    ticketId,
    token,
}: {
    subject: string;
    status: string;
    messages: TicketMessage[];
    apiBaseUrl: string;
    teamId: string;
    ticketId: string;
    token: string;
}) {
    const theme = useSiteThemeStyle();
    return (
        <Section theme={theme}>
            <div className="flex flex-col gap-8">
                <header className="flex flex-col gap-2">
                    <Header1 theme={theme}>{subject}</Header1>
                    <Caption theme={theme}>{status}</Caption>
                </header>
                <ol className="flex flex-col gap-6">
                    {messages.map((message) => (
                        <li key={message.messageId}>
                            <PageCard theme={theme}>
                                <PageCardContent
                                    theme={theme}
                                    className="flex flex-col gap-2"
                                >
                                    <Caption theme={theme}>
                                        {message.author === "requester"
                                            ? "You"
                                            : "Support"}
                                    </Caption>
                                    <TextRenderer
                                        json={message.content}
                                        theme={theme}
                                    />
                                    {message.author === "bot" && (
                                        <CitationList
                                            sources={message.sources}
                                        />
                                    )}
                                </PageCardContent>
                            </PageCard>
                        </li>
                    ))}
                </ol>
                {status !== "closed" && (
                    <TicketReplyForm
                        apiBaseUrl={apiBaseUrl}
                        teamId={teamId}
                        ticketId={ticketId}
                        token={token}
                    />
                )}
            </div>
        </Section>
    );
}
