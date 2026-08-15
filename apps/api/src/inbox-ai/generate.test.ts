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

import { db as testDb } from "../db/client";
import { createTicket, getTicketMessages } from "../tickets/queries";
import { upsertInboxAiPolicy } from "./policy";
import { runInboxAi } from "./generate";
import { HANDOFF_COPY } from "./config";
import { getLanguageModel } from "../ai/provider";
import { getResolvedAiConfig } from "../ai/queries";
import { searchChunks } from "../documentation/queries";

describe("runInboxAi", () => {
    const db = testDb as unknown as TestDb;
    let teamId: string;

    beforeEach(async () => {
        const seeded = await seedTeam(db);
        teamId = seeded.team.id;
        vi.mocked(getLanguageModel).mockResolvedValue(null);
        vi.mocked(getResolvedAiConfig).mockResolvedValue(null);
        vi.mocked(searchChunks).mockResolvedValue([]);
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

    it("escalates on visitor request without calling the model", async () => {
        vi.mocked(getLanguageModel).mockResolvedValue({} as never);
        vi.mocked(getResolvedAiConfig).mockResolvedValue({
            provider: "openai",
            models: { chatbot: "gpt-4o-mini", grammar: null, builder: null },
            region: null,
            endpoint: null,
            apiKey: "sk-test",
        });
        await upsertInboxAiPolicy(teamId, "chatbot", { autoReply: true });
        const created = await createTicket({
            teamId,
            subject: "Help",
            message: "I want to talk to a person please",
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
        expect(searchChunks).not.toHaveBeenCalled();
        const messages = await getTicketMessages(created.ticket.id);
        expect(messages.some((message) => message.author === "bot")).toBe(true);
    });
});
