import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { inboundEmails, tickets } from "../db/schema";
import { findTeamBySubdomain } from "../team/queries";
import {
    addTicketMessage,
    createTicket,
    getTicketByTicketId,
    getTicketNotificationRecipient,
    textTicketMessage,
} from "../tickets/queries";
import { notifyTeamOfRequesterMessage } from "../tickets/notify";
import {
    extractTicketId,
    isOurMailbox,
    parseDisplayName,
    parseEmailAddress,
    parseReplyRecipient,
    parseSupportRecipient,
} from "./address";
import { lookupReplyToken } from "./reply-token";
import { isAutomatedMail, type NormalizedInboundMail } from "./normalized";
import { stripQuotedReply } from "./strip-quotes";

export type InboundResult =
    | { status: "ignored"; reason: string }
    | { status: "duplicate"; ticketId: string }
    | { status: "created"; ticketId: string }
    | { status: "replied"; ticketId: string };

export async function processInboundMail(
    mail: NormalizedInboundMail,
): Promise<InboundResult> {
    if (isAutomatedMail(mail)) {
        return { status: "ignored", reason: "automated" };
    }

    const from = parseEmailAddress(mail.from);
    if (!from) return { status: "ignored", reason: "missing_from" };
    if (isOurMailbox(from)) {
        return { status: "ignored", reason: "loop" };
    }

    const body = stripQuotedReply(mail.text);
    if (!body) return { status: "ignored", reason: "empty_body" };

    const duplicate = await existingInbound(mail.messageId);
    if (duplicate) return duplicate;

    const replyToken = mail.to
        .map(parseReplyRecipient)
        .find((value): value is string => Boolean(value));
    if (replyToken) {
        return appendViaReplyToken(mail, from, body, replyToken);
    }

    const recipients = mail.to
        .map(parseSupportRecipient)
        .filter((value): value is NonNullable<typeof value> => value !== null);
    if (recipients.length === 0) {
        return { status: "ignored", reason: "not_support_address" };
    }

    const recipient = recipients[0];
    const team = await findTeamBySubdomain(recipient.subdomain);
    if (!team) return { status: "ignored", reason: "unknown_team" };

    const ticketId =
        recipient.ticketId ??
        extractTicketId(
            mail.inReplyTo,
            ...(mail.references ?? []),
            mail.subject,
        );

    if (ticketId) {
        return appendToTicket({
            mail,
            from,
            body,
            teamId: team.id,
            ticketPublicId: ticketId,
            requireSenderMatch: true,
        });
    }

    const subject =
        mail.subject.replace(/^(re|fwd):\s*/i, "").trim() ||
        "Email support request";
    const created = await createTicket({
        teamId: team.id,
        subject,
        message: body,
        requesterEmail: from,
        requesterName: parseDisplayName(mail.from),
        source: "email",
    });
    await recordInbound(mail.messageId, team.id, created.ticket.id);
    await notifyTeam(team.id, created.ticket.ticketId, created.ticket.subject);
    return { status: "created", ticketId: created.ticket.ticketId };
}

async function appendViaReplyToken(
    mail: NormalizedInboundMail,
    from: string,
    body: string,
    token: string,
): Promise<InboundResult> {
    const record = await lookupReplyToken(token);
    if (!record) return { status: "ignored", reason: "invalid_token" };
    if (record.requesterEmail !== from) {
        return { status: "ignored", reason: "sender_mismatch" };
    }
    return appendToTicket({
        mail,
        from,
        body,
        teamId: record.teamId,
        ticketPublicId: record.ticketPublicId,
        requireSenderMatch: false,
        ticketDbId: record.ticketDbId,
    });
}

async function appendToTicket(input: {
    mail: NormalizedInboundMail;
    from: string;
    body: string;
    teamId: string;
    ticketPublicId: string;
    requireSenderMatch: boolean;
    ticketDbId?: string;
}): Promise<InboundResult> {
    const duplicate = await existingInbound(input.mail.messageId);
    if (duplicate) return duplicate;

    const ticket = input.ticketDbId
        ? await db.query.tickets.findFirst({
              where: eq(tickets.id, input.ticketDbId),
          })
        : await getTicketByTicketId(input.teamId, input.ticketPublicId);
    if (!ticket) return { status: "ignored", reason: "unknown_ticket" };
    if (
        input.requireSenderMatch &&
        ticket.requesterEmail &&
        ticket.requesterEmail.toLowerCase() !== input.from
    ) {
        return { status: "ignored", reason: "sender_mismatch" };
    }

    await addTicketMessage({
        teamId: ticket.teamId,
        ticketDbId: ticket.id,
        author: "requester",
        content: textTicketMessage(input.body),
    });
    await recordInbound(input.mail.messageId, ticket.teamId, ticket.id);
    await notifyTeam(ticket.teamId, ticket.ticketId, ticket.subject);
    return { status: "replied", ticketId: ticket.ticketId };
}

async function existingInbound(
    messageId: string | undefined,
): Promise<InboundResult | null> {
    if (!messageId) return null;
    const existing = await db.query.inboundEmails.findFirst({
        where: eq(inboundEmails.messageId, messageId),
    });
    if (!existing) return null;
    const ticket = await db.query.tickets.findFirst({
        where: eq(tickets.id, existing.ticketId),
    });
    return {
        status: "duplicate",
        ticketId: ticket?.ticketId ?? existing.ticketId,
    };
}

async function recordInbound(
    messageId: string | undefined,
    teamId: string,
    ticketDbId: string,
) {
    if (!messageId) return;
    await db
        .insert(inboundEmails)
        .values({ messageId, teamId, ticketId: ticketDbId })
        .onConflictDoNothing();
}

async function notifyTeam(teamId: string, ticketId: string, subject: string) {
    const recipient = await getTicketNotificationRecipient(teamId, null);
    if (!recipient) return;
    notifyTeamOfRequesterMessage({
        teamId,
        ticketId,
        recipientEmail: recipient,
        subject,
    }).catch(() => {});
}
