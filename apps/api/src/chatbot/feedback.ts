import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { ticketMessages, type tickets } from "../db/schema";
import { getTicketMessages } from "../tickets/queries";
import { recordDocumentationEvidence } from "../documentation/improvements";

/**
 * Stores a visitor's thumbs up/down on a bot answer. A thumbs down also
 * files the question that answer replied to under documentation
 * improvements (trigger `negative_feedback`), next to retrieval misses and
 * escalations, so the team sees which questions their content answers
 * badly. Returns null when the message isn't a bot answer on this ticket.
 */
export async function rateBotAnswer(input: {
  teamId: string;
  ticket: typeof tickets.$inferSelect;
  messageId: string;
  rating: "up" | "down";
}) {
  const messages = await getTicketMessages(input.ticket.id);
  const index = messages.findIndex((message) => message.messageId === input.messageId);
  const answer = messages[index];
  if (!answer || answer.author !== "bot") return null;

  await db
    .update(ticketMessages)
    .set({ feedback: input.rating })
    .where(eq(ticketMessages.id, answer.id));

  if (input.rating === "down") {
    const question = messages
      .slice(0, index)
      .reverse()
      .find((message) => message.author === "requester");
    if (question)
      await recordDocumentationEvidence({
        teamId: input.teamId,
        ticketDbId: input.ticket.id,
        messageDbId: question.id,
        trigger: "negative_feedback",
        // One improvement entry per rated answer, however often it's re-rated.
        eventId: answer.id,
        retrieved: (answer.sources ?? []).map((source) => ({
          documentId: source.documentId,
          revisionId: source.revisionId,
          publicationId: source.publicationId,
          anchor: source.anchor,
        })),
      });
  }
  return { messageId: answer.messageId, feedback: input.rating };
}
