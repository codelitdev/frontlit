import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { inboxAiRuns } from "../db/schema";
import { isAiConfigured } from "./routes";

export async function ticketAiOptics(
  teamId: string,
  ticket: {
    id: string;
    aiState: string;
    aiStopReason: string | null;
  },
  messages: Array<{ id: string; messageId: string }>,
) {
  if (!(await isAiConfigured(teamId))) return undefined;

  const runs = await db.query.inboxAiRuns.findMany({
    where: eq(inboxAiRuns.ticketId, ticket.id),
    orderBy: inboxAiRuns.createdAt,
  });
  const publicId = new Map(messages.map((row) => [row.id, row.messageId]));

  return {
    state: ticket.aiState,
    stopReason: ticket.aiStopReason,
    runs: runs.map((run) => ({
      triggerMessageId: publicId.get(run.triggerMessageId) ?? run.triggerMessageId,
      status: run.status,
      stopReason: run.stopReason ?? run.skipReason,
      lastError: run.lastError,
      retrieval: run.retrieval ?? [],
      createdAt: run.createdAt.toISOString(),
    })),
  };
}
