import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, type TestDb } from "../test/db";

vi.mock("../db/client", async () => ({
    db: await makeTestDb(),
    sqlTransactionsEnabled: false,
}));

vi.mock("../documentation/queries", () => ({
    searchChunks: vi.fn(async () => []),
}));

vi.mock("../ai/queries", () => ({
    getResolvedAiConfig: vi.fn(async () => null),
}));

vi.mock("../ai/provider", () => ({
    getLanguageModel: vi.fn(async () => null),
}));
vi.mock("./completion", async () => {
    const actual =
        await vi.importActual<typeof import("./completion")>("./completion");
    return {
        ...actual,
        generateInboxAnswer: vi.fn(),
    };
});

import { db as testDb } from "../db/client";
import { createTicket, getTicketMessages } from "../tickets/queries";
import { upsertInboxAiPolicy } from "./policy";
import { runInboxAi } from "./generate";
import { HANDOFF_COPY } from "./config";
import { getLanguageModel } from "../ai/provider";
import { getResolvedAiConfig } from "../ai/queries";
import { searchChunks } from "../documentation/queries";
import { generateInboxAnswer } from "./completion";

describe("runInboxAi", () => {
    const db = testDb as unknown as TestDb;
    let teamId: string;

    beforeEach(async () => {
        const seeded = await seedTeam(db);
        teamId = seeded.team.id;
        vi.mocked(getLanguageModel).mockResolvedValue(null);
        vi.mocked(getResolvedAiConfig).mockResolvedValue(null);
        vi.mocked(searchChunks).mockResolvedValue([]);
        vi.mocked(generateInboxAnswer).mockReset();
    });

    it("does not write a bot message when AI is not configured", async () => {
        await upsertInboxAiPolicy(teamId, "chatbot", { autoReply: true });
        const created = await createTicket({
            teamId,
            subject: "Help",
            message: "How do refunds work?",
            requesterEmail: null,
            source: "chatbot",
            scheduleAi: false,
        });
        const result = await runInboxAi({
            teamId,
            ticketDbId: created.ticket.id,
            triggerMessageId: created.firstMessage.id,
            channel: "chatbot",
            mode: "sync",
        });
        expect(result.outcome).toBe("human_only");
        expect(result.answer).toBeNull();
        const messages = await getTicketMessages(created.ticket.id);
        expect(messages.every((message) => message.author !== "bot")).toBe(
            true,
        );
    });

    it("escalates when the model reports visitor-handoff intent", async () => {
        vi.mocked(getLanguageModel).mockResolvedValue({} as never);
        vi.mocked(getResolvedAiConfig).mockResolvedValue({
            provider: "openai",
            models: { chatbot: "gpt-4o-mini", grammar: null, builder: null },
            region: null,
            endpoint: null,
            apiKey: "sk-test",
        });
        vi.mocked(generateInboxAnswer).mockResolvedValue({
            result: { answer: "", citations: [] },
            usedTokens: 8,
            chunks: [],
            handoff: { reason: "visitor_request" },
        });
        await upsertInboxAiPolicy(teamId, "chatbot", { autoReply: true });
        const created = await createTicket({
            teamId,
            subject: "Help",
            message: "Connect me to someone on the team",
            requesterEmail: null,
            source: "chatbot",
            scheduleAi: false,
        });
        const result = await runInboxAi({
            teamId,
            ticketDbId: created.ticket.id,
            triggerMessageId: created.firstMessage.id,
            channel: "chatbot",
            mode: "sync",
        });
        expect(result.outcome).toBe("escalated");
        expect(result.answer).toBe(HANDOFF_COPY);
        expect(generateInboxAnswer).toHaveBeenCalled();
        expect(
            vi.mocked(generateInboxAnswer).mock.calls[0][0].escalateTopics,
        ).toEqual([]);
        const messages = await getTicketMessages(created.ticket.id);
        expect(messages.some((message) => message.author === "bot")).toBe(true);
    });

    it("does not escalate a greeting when retrieval is empty", async () => {
        vi.mocked(getLanguageModel).mockResolvedValue({} as never);
        vi.mocked(getResolvedAiConfig).mockResolvedValue({
            provider: "openai",
            models: { chatbot: "gpt-4o-mini", grammar: null, builder: null },
            region: null,
            endpoint: null,
            apiKey: "sk-test",
        });
        vi.mocked(searchChunks).mockResolvedValue([]);
        vi.mocked(generateInboxAnswer).mockResolvedValue({
            result: {
                answer: "Hi! How can I help?",
                citations: [],
            },
            usedTokens: 12,
            chunks: [],
            handoff: null,
        });
        await upsertInboxAiPolicy(teamId, "chatbot", {
            autoReply: true,
            escalateWhenUnsure: true,
        });
        const created = await createTicket({
            teamId,
            subject: "Hi",
            message: "Hi",
            requesterEmail: null,
            source: "chatbot",
            scheduleAi: false,
        });
        const result = await runInboxAi({
            teamId,
            ticketDbId: created.ticket.id,
            triggerMessageId: created.firstMessage.id,
            channel: "chatbot",
            mode: "sync",
        });
        expect(result.outcome).toBe("answered");
        expect(result.answer).toBe("Hi! How can I help?");
    });

    it("does not escalate an unanswered product question", async () => {
        vi.mocked(getLanguageModel).mockResolvedValue({} as never);
        vi.mocked(getResolvedAiConfig).mockResolvedValue({
            provider: "openai",
            models: { chatbot: "gpt-4o-mini", grammar: null, builder: null },
            region: null,
            endpoint: null,
            apiKey: "sk-test",
        });
        vi.mocked(generateInboxAnswer).mockResolvedValue({
            result: {
                answer: "I don't have that in the help center. Want a teammate?",
                citations: [],
            },
            usedTokens: 12,
            chunks: [],
            handoff: null,
        });
        await upsertInboxAiPolicy(teamId, "chatbot", { autoReply: true });
        const created = await createTicket({
            teamId,
            subject: "Refunds",
            message: "How do refunds work?",
            requesterEmail: null,
            source: "chatbot",
            scheduleAi: false,
        });
        const result = await runInboxAi({
            teamId,
            ticketDbId: created.ticket.id,
            triggerMessageId: created.firstMessage.id,
            channel: "chatbot",
            mode: "sync",
        });
        expect(result.outcome).toBe("answered");
        expect(result.answer).toMatch(/teammate/i);
    });

    it("escalates when the model matches a configured topic", async () => {
        vi.mocked(getLanguageModel).mockResolvedValue({} as never);
        vi.mocked(getResolvedAiConfig).mockResolvedValue({
            provider: "openai",
            models: { chatbot: "gpt-4o-mini", grammar: null, builder: null },
            region: null,
            endpoint: null,
            apiKey: "sk-test",
        });
        vi.mocked(generateInboxAnswer).mockResolvedValue({
            result: { answer: "", citations: [] },
            usedTokens: 10,
            chunks: [],
            handoff: { reason: "topic", topic: "refund" },
        });
        await upsertInboxAiPolicy(teamId, "chatbot", {
            autoReply: true,
            escalateTopics: ["refund", "cancel"],
        });
        const created = await createTicket({
            teamId,
            subject: "Money back",
            message: "I want my money back",
            requesterEmail: null,
            source: "chatbot",
            scheduleAi: false,
        });
        const result = await runInboxAi({
            teamId,
            ticketDbId: created.ticket.id,
            triggerMessageId: created.firstMessage.id,
            channel: "chatbot",
            mode: "sync",
        });
        expect(result.outcome).toBe("escalated");
        expect(
            vi.mocked(generateInboxAnswer).mock.calls[0][0].escalateTopics,
        ).toEqual(["refund", "cancel"]);
    });

    it("persists cited help articles on the bot reply", async () => {
        vi.mocked(getLanguageModel).mockResolvedValue({} as never);
        vi.mocked(getResolvedAiConfig).mockResolvedValue({
            provider: "openai",
            models: { chatbot: "gpt-4o-mini", grammar: null, builder: null },
            region: null,
            endpoint: null,
            apiKey: "sk-test",
        });
        vi.mocked(searchChunks).mockResolvedValue([
            {
                documentId: "d1",
                slug: "billing",
                title: "Billing",
                heading: null,
                anchor: null,
                content: "Plans start at $10.",
                similarity: 0.9,
                kind: "doc",
            },
            {
                documentId: "d2",
                slug: "refunds",
                title: "Refunds",
                heading: null,
                anchor: "policy",
                content: "Refunds take 5 days.",
                similarity: 0.8,
                kind: "doc",
            },
        ]);
        vi.mocked(generateInboxAnswer).mockResolvedValue({
            result: {
                answer: "Refunds take 5 days [2].",
                citations: [2],
            },
            usedTokens: 40,
            handoff: null,
            chunks: [
                {
                    documentId: "d1",
                    slug: "billing",
                    title: "Billing",
                    heading: null,
                    anchor: null,
                    content: "Plans start at $10.",
                    similarity: 0.9,
                    kind: "doc",
                },
                {
                    documentId: "d2",
                    slug: "refunds",
                    title: "Refunds",
                    heading: null,
                    anchor: "policy",
                    content: "Refunds take 5 days.",
                    similarity: 0.8,
                    kind: "doc",
                },
            ],
        });
        await upsertInboxAiPolicy(teamId, "chatbot", { autoReply: true });
        const created = await createTicket({
            teamId,
            subject: "Help",
            message: "How do refunds work?",
            requesterEmail: null,
            source: "chatbot",
            scheduleAi: false,
        });
        const result = await runInboxAi({
            teamId,
            ticketDbId: created.ticket.id,
            triggerMessageId: created.firstMessage.id,
            channel: "chatbot",
            mode: "sync",
        });
        expect(result.outcome).toBe("answered");
        expect(result.sources).toEqual([
            {
                documentId: "d2",
                slug: "refunds",
                title: "Refunds",
                anchor: "policy",
                kind: "doc",
            },
        ]);
        const bot = (await getTicketMessages(created.ticket.id)).find(
            (message) => message.author === "bot",
        );
        expect(bot?.sources).toEqual(result.sources);
    });
});
