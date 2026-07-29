import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, type TestDb } from "../test/db";

vi.mock("../db/client", async () => ({ db: await makeTestDb() }));

import { db as testDb } from "../db/client";
import {
    addTicketMessage,
    createTicket,
    getTicketByTicketId,
    getTicketMessages,
    getTicketNotificationRecipient,
    listTickets,
    reissueTicketAccessToken,
    textTicketMessage,
    ticketMessageText,
    updateTicket,
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
        expect(messages.map((message) => message.author)).toEqual([
            "requester",
            "bot",
        ]);
        expect(
            messages.map((message) => ticketMessageText(message.content)),
        ).toEqual(["How does the team plan work?", "It includes six seats."]);

        const inbox = await listTickets({ teamId });
        expect(inbox).toHaveLength(1);
        expect(inbox[0].ticketId).toBe(ticket.ticketId);

        const otherTeam = await seedTeam(db, { name: "Other team" });
        expect(
            await getTicketByTicketId(otherTeam.team.id, ticket.ticketId),
        ).toBeUndefined();
    });
});

describe("help-desk ticket lifecycle", () => {
    const db = testDb as unknown as TestDb;
    let teamId: string;
    let ownerAccountId: string;
    let otherTeamId: string;

    beforeEach(async () => {
        const seeded = await seedTeam(db);
        const other = await seedTeam(db, { name: "Other team" });
        teamId = seeded.team.id;
        ownerAccountId = seeded.account.id;
        otherTeamId = other.team.id;
    });

    it("supports workspace list/get/status update with team isolation", async () => {
        const open = await createTicket({
            teamId,
            subject: "Cannot login",
            message: "Password reset never arrives.",
            requesterEmail: "user@example.com",
            requesterName: "Alex",
            source: "form",
        });
        const resolved = await createTicket({
            teamId,
            subject: "Feature request",
            message: "Please add SSO.",
            requesterEmail: "pm@example.com",
            source: "form",
        });
        await updateTicket(teamId, resolved.ticket.ticketId, {
            status: "resolved",
        });

        const inbox = await listTickets({ teamId });
        expect(inbox.map((row) => row.ticketId).sort()).toEqual(
            [open.ticket.ticketId, resolved.ticket.ticketId].sort(),
        );

        const onlyOpen = await listTickets({ teamId, status: "open" });
        expect(onlyOpen).toHaveLength(1);
        expect(onlyOpen[0].ticketId).toBe(open.ticket.ticketId);

        const fetched = await getTicketByTicketId(teamId, open.ticket.ticketId);
        expect(fetched).toMatchObject({
            ticketId: open.ticket.ticketId,
            subject: "Cannot login",
            status: "open",
            requesterEmail: "user@example.com",
        });

        const statusUpdated = await updateTicket(teamId, open.ticket.ticketId, {
            status: "pending",
            assigneeAccountId: ownerAccountId,
        });
        expect(statusUpdated).toMatchObject({
            ticketId: open.ticket.ticketId,
            status: "pending",
            assigneeAccountId: ownerAccountId,
        });

        expect(
            await getTicketByTicketId(otherTeamId, open.ticket.ticketId),
        ).toBeUndefined();
        expect(
            await updateTicket(otherTeamId, open.ticket.ticketId, {
                status: "closed",
            }),
        ).toBeNull();
        expect(
            (await getTicketByTicketId(teamId, open.ticket.ticketId))?.status,
        ).toBe("pending");
    });

    it("lets the requester reply with a valid token and rotates access on reissue", async () => {
        const { ticket, token } = await createTicket({
            teamId,
            subject: "Invoice copy",
            message: "Please send last month's invoice.",
            requesterEmail: "billing@example.com",
            source: "form",
        });

        expect(verifyTicketAccess(ticket, token)).toBe(true);

        await addTicketMessage({
            teamId,
            ticketDbId: ticket.id,
            author: "agent",
            authorAccountId: ownerAccountId,
            content: textTicketMessage("Sent — check your email."),
        });

        await addTicketMessage({
            teamId,
            ticketDbId: ticket.id,
            author: "requester",
            content: textTicketMessage("Got it, thanks."),
        });

        const messages = await getTicketMessages(ticket.id);
        expect(messages.map((message) => message.author)).toEqual([
            "requester",
            "agent",
            "requester",
        ]);
        expect(ticketMessageText(messages[2].content)).toBe("Got it, thanks.");

        const freshToken = await reissueTicketAccessToken(ticket.id);
        expect(freshToken).not.toBe(token);

        const reloaded = await getTicketByTicketId(teamId, ticket.ticketId);
        expect(reloaded).toBeDefined();
        expect(verifyTicketAccess(reloaded!, token)).toBe(false);
        expect(verifyTicketAccess(reloaded!, freshToken)).toBe(true);
    });

    it("notifies the assignee when set, otherwise the team owner", async () => {
        const ownerEmail = await getTicketNotificationRecipient(teamId, null);
        expect(ownerEmail).toEqual(expect.stringContaining("@"));

        const assigneeEmail = await getTicketNotificationRecipient(
            teamId,
            ownerAccountId,
        );
        expect(assigneeEmail).toBe(ownerEmail);

        expect(
            await getTicketNotificationRecipient(teamId, "acct_does_not_exist"),
        ).toBe(ownerEmail);
    });
});
