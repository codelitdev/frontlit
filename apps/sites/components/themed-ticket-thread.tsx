import { TextRenderer } from "@frontlit/text-editor/renderer";
import {
  Caption,
  Header1,
  PageCard,
  PageCardContent,
  Section,
} from "@frontlit/page-builder/primitives/server";
import { getTeamThemeStyle } from "@/lib/team-theme";
import { CitationList } from "@/components/citation-list";
import { TicketReplyForm } from "@/components/ticket-reply-form";
import { getSiteHosts, type TicketMessage } from "@/lib/api";

/** Text of a one-line thread event such as "Sam has joined". */
function plainText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const value = node as { text?: unknown; content?: unknown };
  if (typeof value.text === "string") return value.text;
  return Array.isArray(value.content) ? value.content.map(plainText).join("") : "";
}

export async function ThemedTicketThread({
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
  const [theme, siteHosts] = await Promise.all([
    getTeamThemeStyle(teamId),
    getSiteHosts(teamId),
  ]);
  return (
    <Section theme={theme}>
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-2">
          <Header1 theme={theme}>{subject}</Header1>
          <Caption theme={theme}>{status}</Caption>
        </header>
        <ol className="flex flex-col gap-6">
          {messages.map((message) =>
            message.author === "system" ? (
              <li key={message.messageId} className="flex justify-center">
                <Caption theme={theme}>{plainText(message.content)}</Caption>
              </li>
            ) : (
              <li key={message.messageId}>
                <PageCard theme={theme}>
                  <PageCardContent theme={theme} className="flex flex-col gap-2">
                    <Caption theme={theme}>
                      {message.author === "requester" ? "You" : "Support"}
                    </Caption>
                    <TextRenderer
                      json={message.content}
                      theme={theme}
                      siteHosts={siteHosts}
                    />
                    {message.author === "bot" && (
                      <CitationList sources={message.sources} />
                    )}
                  </PageCardContent>
                </PageCard>
              </li>
            ),
          )}
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
