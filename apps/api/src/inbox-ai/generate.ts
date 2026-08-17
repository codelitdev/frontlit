import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
    inboxAiRuns,
    ticketMessages,
    tickets,
    type InboxAiChannel,
    type InboxAiRetrievalHit,
} from "../db/schema";
import { getResolvedAiConfig } from "../ai/queries";
import { getLanguageModel } from "../ai/provider";
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
    estimateTokens,
    inboxAiEnabled,
} from "./config";
import { getInboxAiPolicy, type InboxAiPolicy } from "./policy";
import { chargeReservation, releaseReservation, reserveTokens } from "./usage";
import {
    InboxAiProviderError,
    citationsFromModel,
    generateInboxAnswer,
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
        kind?: "blog" | "doc" | "changelog";
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

function toRetrieval(
    chunks: {
        documentId: string;
        slug: string;
        title: string | null;
        heading: string | null;
        anchor: string | null;
        similarity: number;
        kind?: "blog" | "doc" | "changelog";
    }[],
): InboxAiRetrievalHit[] {
    return chunks.map((chunk) => ({
        documentId: chunk.documentId,
        slug: chunk.slug,
        title: chunk.title,
        heading: chunk.heading,
        anchor: chunk.anchor,
        similarity: Math.round(chunk.similarity * 1000) / 1000,
        kind: chunk.kind,
    }));
}

async function markRun(
    runId: string,
    status: "succeeded" | "skipped" | "failed",
    extra: {
        skipReason?: string;
        stopReason?: string | null;
        lastError?: string;
        retrieval?: InboxAiRetrievalHit[];
    } = {},
) {
    await db
        .update(inboxAiRuns)
        .set({
            status,
            skipReason: extra.skipReason,
            stopReason: extra.stopReason ?? null,
            lastError: extra.lastError?.slice(0, 500),
            retrieval: extra.retrieval ?? [],
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
    sources: InboxAiResult["sources"],
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
        sources,
    });
    return true;
}

async function notifyIfTicketChannel(
    ticket: TicketRow,
    channel: InboxAiChannel,
    replyText: string,
    sources: InboxAiResult["sources"] = [],
) {
    if (channel !== "tickets" || !ticket.requesterEmail) return;
    const token = await mintAccessGrant(ticket.teamId, ticket.id);
    await enqueueTicketMail({
        teamId: ticket.teamId,
        ticketDbId: ticket.id,
        kind: "reply",
        payload: {
            token,
            replyText,
            sources: sources.map((source) => ({
                slug: source.slug,
                title: source.title,
                anchor: source.anchor,
            })),
        },
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
        retrieval: InboxAiRetrievalHit[] = [],
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
        if (runId)
            await markRun(runId, "succeeded", {
                stopReason: reason,
                retrieval,
            });
        logEscalated(reason, input.channel);
        await notifyIfTicketChannel(ticket, input.channel, HANDOFF_COPY);
        publishInboxUpdate(ticket.teamId, ticket.ticketId);
        return {
            outcome: "escalated",
            answer: HANDOFF_COPY,
            sources: [],
        };
    };

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
    let retrieval: InboxAiRetrievalHit[] = [];
    try {
        callStarted = true;
        const generated = await generateInboxAnswer({
            teamId: input.teamId,
            question: visitorText,
            history,
            teamName: teamSettings.title || team?.name,
            aiConfig,
            offerHuman: policy.escalateWhenUnsure,
            allowVisitorHandoff: policy.escalateOnVisitorRequest,
            escalateTopics: policy.escalateTopics,
            timeoutMs:
                input.mode === "sync"
                    ? CHAT_PROVIDER_TIMEOUT_MS
                    : TICKET_PROVIDER_TIMEOUT_MS,
        });
        usedTokens = generated.usedTokens || estimated;
        retrieval = toRetrieval(generated.chunks);

        if (generated.handoff) {
            return escalateDeterministic(generated.handoff.reason, retrieval);
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
                    retrieval,
                });
            return { ...empty, skipReason: stillValid.reason };
        }

        const sources = citationsFromModel(
            generated.chunks,
            generated.result.citations,
        );
        const ok = await persistAnswer(
            ticket,
            generated.result.answer,
            claim,
            trigger.id,
            sources,
        );
        if (!ok) {
            incrementCounter("inbox_ai_discarded_total", {
                reason: "generation_mismatch",
                channel: input.channel,
            });
            if (runId) await markRun(runId, "skipped", { skipReason: "stale" });
            return { ...empty, skipReason: "stale" };
        }
        if (runId) await markRun(runId, "succeeded", { retrieval });
        incrementCounter("inbox_ai_generated_total", {
            channel: input.channel,
            outcome: "answered",
        });
        await notifyIfTicketChannel(
            ticket,
            input.channel,
            generated.result.answer,
            sources,
        );
        publishInboxUpdate(ticket.teamId, ticket.ticketId);
        return {
            outcome: "answered",
            answer: generated.result.answer,
            sources,
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
            {
                channel: input.channel,
                reason: kind,
                error: error instanceof Error ? error.message : String(error),
            },
            "Inbox AI provider call failed",
        );
        if (runId) {
            await markRun(runId, "failed", {
                lastError:
                    error instanceof Error
                        ? `${kind}: ${error.message}`.slice(0, 500)
                        : kind,
                retrieval,
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
