import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { inboxAiRuns, type InboxAiChannel } from "../db/schema";

export async function enqueueInboxAiRun(input: {
    teamId: string;
    ticketDbId: string;
    triggerMessageId: string;
    channel: InboxAiChannel;
}): Promise<string> {
    try {
        const [run] = await db
            .insert(inboxAiRuns)
            .values({
                teamId: input.teamId,
                ticketId: input.ticketDbId,
                triggerMessageId: input.triggerMessageId,
                channel: input.channel,
                status: "queued",
            })
            .returning();
        return run.id;
    } catch {
        const existing = await db.query.inboxAiRuns.findFirst({
            where: and(
                eq(inboxAiRuns.ticketId, input.ticketDbId),
                eq(inboxAiRuns.triggerMessageId, input.triggerMessageId),
            ),
        });
        return existing?.id ?? "";
    }
}

export function ticketsChannelForSource(source: string): InboxAiChannel | null {
    if (source === "chatbot") return "chatbot";
    if (source === "form" || source === "email" || source === "api") {
        return "tickets";
    }
    return null;
}
