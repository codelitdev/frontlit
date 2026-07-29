import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, type TestDb } from "../test/db";

vi.mock("../db/client", async () => ({ db: await makeTestDb() }));

import { db as testDb } from "../db/client";
import {
    addTicketMessage,
    createTicket,
    getTicketByTicketId,
    getTicketMessages,
    listTickets,
    textTicketMessage,
    ticketMessageText,
    verifyTicketAccess,
} from "./queries";

describe("persisted chatbot conversations", () => {
    const db = testDb as unknown as TestDb;
    let teamId: string;

    beforeEach(async () => {
        const seeded = await seedTeam(db);
        teamId = seeded.team.id;
    });

    it("stores an anonymous chat as a team-scoped ticket thread", async () => {
        const { ticket, token } = await createTicket({
            teamId,
            subject: "How does the team plan work?",
            message: "How does the team plan work?",
            requesterEmail: null,
            source: "chatbot",
        });

        expect(ticket.requesterEmail).toBeNull();
        expect(ticket.source).toBe("chatbot");
        expect(verifyTicketAccess(ticket, token)).toBe(true);
        expect(verifyTicketAccess(ticket, "not-the-token")).toBe(false);

        await addTicketMessage({
            teamId,
            ticketDbId: ticket.id,
            author: "bot",
            content: textTicketMessage("It includes six seats."),
        });

        const messages = await getTicketMessages(ticket.id);
        expect(messages.map((message) => message.author)).toEqual(["requester", "bot"]);
        expect(messages.map((message) => ticketMessageText(message.content))).toEqual([
            "How does the team plan work?",
            "It includes six seats.",
        ]);

        const inbox = await listTickets({ teamId });
        expect(inbox).toHaveLength(1);
        expect(inbox[0].ticketId).toBe(ticket.ticketId);

        const otherTeam = await seedTeam(db, { name: "Other team" });
        expect(await getTicketByTicketId(otherTeam.team.id, ticket.ticketId)).toBeUndefined();
    });
});
