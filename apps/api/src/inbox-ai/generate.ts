import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
    inboxAiRuns,
    ticketMessages,
    tickets,
    type InboxAiChannel,
} from "../db/schema";
import { getResolvedAiConfig } from "../ai/queries";
import { getLanguageModel } from "../ai/provider";
import { searchChunks } from "../documentation/queries";
import { getTeamSettings } from "../settings/queries";
import { findTeamById } from "../team/queries";
import {
    addTicketMessage,
    getTicketMessages,
    textTicketMessage,
    ticketMessageText,
} from "../tickets/queries";
import { publishInboxUpdate } from "../tickets/live";
import { logger } from "../services/log";
import { incrementCounter } from "../services/metrics";
import {
    CHAT_PROVIDER_TIMEOUT_MS,
    HANDOFF_COPY,
    MAX_HISTORY_MESSAGES,
    MAX_MESSAGE_CHARS,
    MAX_OUTPUT_TOKENS,
    TICKET_PROVIDER_RETRIES,
    TICKET_PROVIDER_TIMEOUT_MS,
    VISITOR_HANDOFF_PHRASES,
    estimateTokens,
    inboxAiEnabled,
} from "./config";
import { findMatchingPhrase } from "./normalize";
import { getInboxAiPolicy, type InboxAiPolicy } from "./policy";
import { chargeReservation, releaseReservation, reserveTokens } from "./usage";
import {
    InboxAiProviderError,
    generateStructuredInboxAnswer,
} from "./completion";
import { enqueueTicketMail } from "./mail";
import { mintAccessGrant } from "./grants";
import { enqueueInboxAiRun } from "./schedule";

export type InboxAiOutcome = "answered" | "human_only" | "escalated";

export type InboxAiResult = {
    outcome: InboxAiOutcome;
    answer: string | null;
    sources: Array<{
        documentId: string;
        slug: string;
        title: string | null;
        anchor: string | null;
    }>;
    skipReason?: string;
};

type TicketRow = typeof tickets.$inferSelect;

function logSkip(reason: string, extra: Record<string, string> = {}) {
    incrementCounter("inbox_ai_skipped_total", { reason, ...extra });
}

function logEscalated(reason: string, channel: InboxAiChannel) {
    incrementCounter("inbox_ai_escalated_total", { reason, channel });
}

function hardStopReason(ticket: TicketRow): string | null {
    if (!inboxAiEnabled()) return "global_disabled";
    if (ticket.status === "closed") return "closed";
    if (ticket.aiState === "escalated") return "already_escalated";
    if (ticket.aiState === "taken_over") return "takeover";
    return null;
}

async function markRun(
    runId: string,
    status: "succeeded" | "skipped" | "failed",
    extra: { skipReason?: string; lastError?: string } = {},
) {
    await db
        .update(inboxAiRuns)
        .set({
            status,
            skipReason: extra.skipReason,
            lastError: extra.lastError?.slice(0, 500),
            finishedAt: new Date(),
            leaseExpiresAt: null,
            updatedAt: new Date(),
        })
        .where(eq(inboxAiRuns.id, runId));
}

export async function ticketHasActiveLease(
    ticketDbId: string,
    exceptRunId?: string,
) {
    const now = new Date();
    const runs = await db.query.inboxAiRuns.findMany({
        where: and(
            eq(inboxAiRuns.ticketId, ticketDbId),
            eq(inboxAiRuns.status, "generating"),
        ),
    });
    return runs.some(
        (run) =>
            run.id !== exceptRunId &&
            run.leaseExpiresAt &&
            run.leaseExpiresAt > now,
    );
}

export async function claimInboxAiRun(runId: string, leaseMs: number) {
    const [claimed] = await db
        .update(inboxAiRuns)
        .set({
            status: "generating",
            attempts: sql`${inboxAiRuns.attempts} + 1`,
            startedAt: new Date(),
            leaseExpiresAt: new Date(Date.now() + leaseMs),
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(inboxAiRuns.id, runId),
                sql`${inboxAiRuns.status} IN ('queued', 'generating')`,
            ),
        )
        .returning();
    return claimed ?? null;
}

async function claimTicketGeneration(
    ticket: TicketRow,
    triggerMessageId: string,
): Promise<number | null> {
    const [updated] = await db
        .update(tickets)
        .set({
            aiState: "generating",
            aiGeneration: sql`${tickets.aiGeneration} + 1`,
            aiTriggerMessageId: triggerMessageId,
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(tickets.id, ticket.id),
                sql`${tickets.aiState} NOT IN ('escalated', 'taken_over')`,
                sql`${tickets.status} <> 'closed'`,
            ),
        )
        .returning();
    return updated?.aiGeneration ?? null;
}

async function finalizeTicket(input: {
    ticket: TicketRow;
    claim: number;
    triggerMessageId: string;
    next: {
        status: "open" | "pending";
        aiState: "waiting" | "escalated" | "idle";
        aiStopReason?: TicketRow["aiStopReason"];
    };
}): Promise<boolean> {
    const [updated] = await db
        .update(tickets)
        .set({
            status: input.next.status,
            aiState: input.next.aiState,
            aiStopReason: input.next.aiStopReason ?? input.ticket.aiStopReason,
            aiStoppedAt:
                input.next.aiState === "escalated"
                    ? new Date()
                    : input.ticket.aiStoppedAt,
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(tickets.id, input.ticket.id),
                eq(tickets.aiGeneration, input.claim),
                eq(tickets.aiTriggerMessageId, input.triggerMessageId),
                sql`${tickets.aiState} NOT IN ('escalated', 'taken_over')`,
                sql`${tickets.status} <> 'closed'`,
            ),
        )
        .returning();
    return Boolean(updated);
}

function historyFromMessages(
    messages: Array<{ author: string; content: unknown; id: string }>,
    triggerId: string,
) {
    return messages
        .filter((message) => message.id !== triggerId)
        .slice(-MAX_HISTORY_MESSAGES)
        .map((message) => ({
            role:
                message.author === "requester"
                    ? ("user" as const)
                    : ("assistant" as const),
            content: ticketMessageText(message.content).slice(
                0,
                MAX_MESSAGE_CHARS,
            ),
        }));
}

function countBotAnswers(
    messages: Array<{ author: string; content: unknown }>,
) {
    return messages.filter(
        (message) =>
            message.author === "bot" &&
            ticketMessageText(message.content) !== HANDOFF_COPY,
    ).length;
}

async function persistHandoff(
    ticket: TicketRow,
    reason: NonNullable<TicketRow["aiStopReason"]>,
    claim: number,
    triggerMessageId: string,
): Promise<boolean> {
    const committed = await finalizeTicket({
        ticket,
        claim,
        triggerMessageId,
        next: {
            status: "open",
            aiState: "escalated",
            aiStopReason: reason,
        },
    });
    if (!committed) return false;
    await addTicketMessage({
        teamId: ticket.teamId,
        ticketDbId: ticket.id,
        author: "bot",
        content: textTicketMessage(HANDOFF_COPY),
    });
    return true;
}

async function persistAnswer(
    ticket: TicketRow,
    answer: string,
    claim: number,
    triggerMessageId: string,
): Promise<boolean> {
    const committed = await finalizeTicket({
        ticket,
        claim,
        triggerMessageId,
        next: { status: "pending", aiState: "waiting" },
    });
    if (!committed) return false;
    await addTicketMessage({
        teamId: ticket.teamId,
        ticketDbId: ticket.id,
        author: "bot",
        content: textTicketMessage(answer),
    });
    return true;
}

async function notifyIfTicketChannel(
    ticket: TicketRow,
    channel: InboxAiChannel,
    replyText: string,
) {
    if (channel !== "tickets" || !ticket.requesterEmail) return;
    const token = await mintAccessGrant(ticket.teamId, ticket.id);
    await enqueueTicketMail({
        teamId: ticket.teamId,
        ticketDbId: ticket.id,
        sequence: 2,
        kind: "reply",
        payload: { token, replyText },
    });
}

export async function runInboxAi(input: {
    teamId: string;
    ticketDbId: string;
    triggerMessageId: string;
    channel: InboxAiChannel;
    mode: "sync" | "job";
    runId?: string;
}): Promise<InboxAiResult> {
    const empty: InboxAiResult = {
        outcome: "human_only",
        answer: null,
        sources: [],
    };

    const ticket = await db.query.tickets.findFirst({
        where: and(
            eq(tickets.id, input.ticketDbId),
            eq(tickets.teamId, input.teamId),
        ),
    });
    if (!ticket) return { ...empty, skipReason: "missing_ticket" };

    const runId =
        input.runId ||
        (await enqueueInboxAiRun({
            teamId: input.teamId,
            ticketDbId: input.ticketDbId,
            triggerMessageId: input.triggerMessageId,
            channel: input.channel,
        }));

    const existing = await db.query.inboxAiRuns.findFirst({
        where: eq(inboxAiRuns.id, runId),
    });
    if (
        existing &&
        (existing.status === "succeeded" || existing.status === "skipped")
    ) {
        return { ...empty, skipReason: existing.skipReason ?? "already_done" };
    }

    if (await ticketHasActiveLease(ticket.id, runId)) {
        if (input.mode === "sync") {
            return { ...empty, skipReason: "lease_held" };
        }
        return { ...empty, skipReason: "lease_wait" };
    }

    const leaseMs =
        input.mode === "sync"
            ? CHAT_PROVIDER_TIMEOUT_MS + 5_000
            : TICKET_PROVIDER_TIMEOUT_MS + 10_000;
    if (runId) await claimInboxAiRun(runId, leaseMs);

    const finishSkip = async (reason: string) => {
        if (runId) await markRun(runId, "skipped", { skipReason: reason });
        await db
            .update(tickets)
            .set({
                aiState: "idle",
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(tickets.id, ticket.id),
                    eq(tickets.aiState, "generating"),
                ),
            );
        logSkip(reason, { channel: input.channel });
        return { ...empty, skipReason: reason };
    };

    const stop = hardStopReason(ticket);
    if (stop) return finishSkip(stop);

    const policy = await getInboxAiPolicy(input.teamId, input.channel);
    if (!policy.autoReply) return finishSkip("auto_reply_off");

    const aiConfig = await getResolvedAiConfig(input.teamId);
    const model = await getLanguageModel(aiConfig, "chatbot");
    if (!aiConfig || !model) return finishSkip("no_ai");

    const trigger = await db.query.ticketMessages.findFirst({
        where: eq(ticketMessages.id, input.triggerMessageId),
    });
    if (!trigger || trigger.author !== "requester") {
        return finishSkip("stale_trigger");
    }

    const messages = await getTicketMessages(ticket.id);
    if (messages.some((message) => message.author === "agent")) {
        return finishSkip("takeover");
    }
    const latestRequester = [...messages]
        .reverse()
        .find((message) => message.author === "requester");
    if (!latestRequester || latestRequester.id !== trigger.id) {
        return finishSkip("stale_trigger");
    }

    const claim = await claimTicketGeneration(ticket, trigger.id);
    if (claim === null) return finishSkip("claim_failed");

    const visitorText = ticketMessageText(trigger.content).slice(
        0,
        MAX_MESSAGE_CHARS,
    );

    const escalateDeterministic = async (
        reason: NonNullable<TicketRow["aiStopReason"]>,
    ): Promise<InboxAiResult> => {
        const ok = await persistHandoff(ticket, reason, claim, trigger.id);
        if (!ok) {
            incrementCounter("inbox_ai_discarded_total", {
                reason: "generation_mismatch",
                channel: input.channel,
            });
            if (runId) await markRun(runId, "skipped", { skipReason: "stale" });
            return { ...empty, skipReason: "stale" };
        }
        if (runId) await markRun(runId, "succeeded");
        logEscalated(reason, input.channel);
        await notifyIfTicketChannel(ticket, input.channel, HANDOFF_COPY);
        publishInboxUpdate(ticket.teamId, ticket.ticketId);
        return {
            outcome: "escalated",
            answer: HANDOFF_COPY,
            sources: [],
        };
    };

    if (policy.escalateOnVisitorRequest) {
        if (findMatchingPhrase(visitorText, VISITOR_HANDOFF_PHRASES)) {
            return escalateDeterministic("visitor_request");
        }
    }
    if (policy.escalateTopics.length > 0) {
        if (findMatchingPhrase(visitorText, policy.escalateTopics)) {
            return escalateDeterministic("topic");
        }
    }
    if (policy.escalateAfterBotTurns) {
        if (countBotAnswers(messages) >= policy.escalateAfterBotTurns) {
            return escalateDeterministic("turn_cap");
        }
    }

    const chunks = await searchChunks(input.teamId, visitorText);
    if (chunks.length === 0 && policy.escalateWhenUnsure) {
        return escalateDeterministic("unsure");
    }

    const team = await findTeamById(input.teamId);
    const teamSettings = await getTeamSettings(input.teamId);
    const history = historyFromMessages(messages, trigger.id);
    const estimated =
        estimateTokens(visitorText) +
        history.reduce((sum, turn) => sum + estimateTokens(turn.content), 0) +
        MAX_OUTPUT_TOKENS;

    const reserved = await reserveTokens(input.teamId, estimated);
    if (!reserved) return finishSkip("budget_exhausted");

    let usedTokens = estimated;
    let callStarted = false;
    try {
        callStarted = true;
        const { result, usedTokens: actual } =
            await generateStructuredInboxAnswer({
                question: visitorText,
                chunks,
                history,
                teamName: teamSettings.title || team?.name,
                aiConfig,
                escalateWhenUnsure: policy.escalateWhenUnsure,
                timeoutMs:
                    input.mode === "sync"
                        ? CHAT_PROVIDER_TIMEOUT_MS
                        : TICKET_PROVIDER_TIMEOUT_MS,
            });
        usedTokens = actual || estimated;

        if (result.escalate && !policy.escalateWhenUnsure) {
            throw new InboxAiProviderError(
                "invalid_output",
                "escalate_disabled",
            );
        }

        const stillValid = await canCommit(ticket, claim, trigger.id, policy);
        if (!stillValid.ok) {
            incrementCounter("inbox_ai_discarded_total", {
                reason: stillValid.reason,
                channel: input.channel,
            });
            if (runId)
                await markRun(runId, "skipped", {
                    skipReason: stillValid.reason,
                });
            return { ...empty, skipReason: stillValid.reason };
        }

        if (result.escalate && policy.escalateWhenUnsure) {
            return escalateDeterministic("unsure");
        }

        const ok = await persistAnswer(
            ticket,
            result.answer,
            claim,
            trigger.id,
        );
        if (!ok) {
            incrementCounter("inbox_ai_discarded_total", {
                reason: "generation_mismatch",
                channel: input.channel,
            });
            if (runId) await markRun(runId, "skipped", { skipReason: "stale" });
            return { ...empty, skipReason: "stale" };
        }
        if (runId) await markRun(runId, "succeeded");
        incrementCounter("inbox_ai_generated_total", {
            channel: input.channel,
            outcome: "answered",
        });
        await notifyIfTicketChannel(ticket, input.channel, result.answer);
        publishInboxUpdate(ticket.teamId, ticket.ticketId);
        return {
            outcome: "answered",
            answer: result.answer,
            sources: chunks.slice(0, 6).map((chunk) => ({
                documentId: chunk.documentId,
                slug: chunk.slug,
                title: chunk.title,
                anchor: chunk.anchor,
            })),
        };
    } catch (error) {
        const kind =
            error instanceof InboxAiProviderError
                ? error.kind
                : "provider_transient";
        incrementCounter("inbox_ai_failed_total", {
            channel: input.channel,
            reason: kind,
        });
        logger.warn(
            { channel: input.channel, reason: kind },
            "Inbox AI provider call failed",
        );
        if (runId) {
            await markRun(runId, "failed", {
                lastError: kind,
            });
        }
        await db
            .update(tickets)
            .set({
                aiState: "idle",
                status: "open",
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(tickets.id, ticket.id),
                    eq(tickets.aiGeneration, claim),
                    sql`${tickets.aiState} NOT IN ('escalated', 'taken_over')`,
                ),
            );
        return { ...empty, skipReason: kind };
    } finally {
        if (callStarted) {
            await chargeReservation(input.teamId, estimated, usedTokens);
        } else {
            await releaseReservation(input.teamId, estimated);
        }
    }
}

async function canCommit(
    ticket: TicketRow,
    claim: number,
    triggerId: string,
    policy: InboxAiPolicy,
): Promise<{ ok: true } | { ok: false; reason: string }> {
    const fresh = await db.query.tickets.findFirst({
        where: eq(tickets.id, ticket.id),
    });
    if (!fresh) return { ok: false, reason: "missing_ticket" };
    if (fresh.aiGeneration !== claim)
        return { ok: false, reason: "generation_mismatch" };
    if (fresh.aiTriggerMessageId !== triggerId)
        return { ok: false, reason: "newer_requester_message" };
    if (fresh.aiState === "taken_over" || fresh.status === "closed") {
        return { ok: false, reason: "agent_takeover" };
    }
    if (!inboxAiEnabled()) return { ok: false, reason: "global_disabled" };
    const latestPolicy = await getInboxAiPolicy(ticket.teamId, policy.channel);
    if (!latestPolicy.autoReply)
        return { ok: false, reason: "policy_disabled" };
    const aiConfig = await getResolvedAiConfig(ticket.teamId);
    const model = await getLanguageModel(aiConfig, "chatbot");
    if (!model) return { ok: false, reason: "ai_removed" };
    const messages = await getTicketMessages(ticket.id);
    if (messages.some((message) => message.author === "agent")) {
        return { ok: false, reason: "agent_takeover" };
    }
    return { ok: true };
}

export { TICKET_PROVIDER_RETRIES };
