import { randomBytes } from "node:crypto";
import { logger } from "../services/log";
import { sendMail, type MailMessage } from "../utils/mail";
import { getDomainSettings, getPlatformSiteDomain } from "../domains/queries";
import { findTeamById } from "../team/queries";
import {
    conversationMessageId,
    outboundMessageId,
    replyToAddress,
    supportFromHeader,
} from "../mail/address";
import { inboundEmailDomain } from "../mail/config";
import { mintReplyToken } from "../mail/reply-token";

function sitesOrigin(canonicalHost: string | null): string {
    if (!canonicalHost) {
        return process.env.SITES_BASE_URL ?? "http://localhost:3002";
    }
    const platform = getPlatformSiteDomain();
    const local =
        platform === "localhost" ||
        canonicalHost === "localhost" ||
        canonicalHost.endsWith(".localhost");
    return `${local ? "http" : "https"}://${canonicalHost}${local ? ":3002" : ""}`;
}

async function threadUrl(
    teamId: string,
    ticketId: string,
    token: string,
): Promise<string> {
    const settings = await getDomainSettings(teamId);
    const origin = sitesOrigin(settings?.canonicalHost ?? null);
    return `${origin}/help/tickets/${encodeURIComponent(ticketId)}?token=${encodeURIComponent(token)}`;
}

function inboxUrl(ticketId: string): string {
    const base = (process.env.WEB_BASE_URL ?? "http://localhost:3000").replace(
        /\/$/,
        "",
    );
    return `${base}/?ticket=${encodeURIComponent(ticketId)}`;
}

async function mailboxHeaders(
    teamId: string,
    ticketId: string,
    requesterEmail?: string,
): Promise<
    Pick<
        MailMessage,
        "from" | "replyTo" | "messageId" | "inReplyTo" | "references"
    >
> {
    const team = await findTeamById(teamId);
    if (!team?.subdomain) return {};
    const from = supportFromHeader(team.name, team.subdomain);
    const conversation = conversationMessageId(ticketId, team.subdomain);
    let replyTo = from;
    if (requesterEmail && inboundEmailDomain()) {
        const token = await mintReplyToken({
            teamId,
            ticketPublicId: ticketId,
            requesterEmail,
        });
        replyTo = (token && replyToAddress(token)) || from;
    }
    return {
        from,
        replyTo,
        messageId: outboundMessageId(
            ticketId,
            team.subdomain,
            randomBytes(6).toString("hex"),
        ),
        inReplyTo: conversation,
        references: [conversation],
    };
}

/** Platform SMTP so local Mailpit works; From is the team's support@ mailbox. */
async function notify(
    teamId: string,
    ticketId: string,
    to: string,
    subject: string,
    text: string,
    html: string,
    mintReplyTo?: boolean,
): Promise<void> {
    try {
        await sendMail({
            to,
            subject,
            text,
            html,
            ...(await mailboxHeaders(
                teamId,
                ticketId,
                mintReplyTo ? to : undefined,
            )),
        });
    } catch (err) {
        logger.warn(
            { to, error: err instanceof Error ? err.message : String(err) },
            "Ticket notification email failed",
        );
    }
}

export async function notifyRequesterOfTicketCreated(input: {
    teamId: string;
    ticketId: string;
    token: string;
    requesterEmail: string;
    subject: string;
}) {
    const url = await threadUrl(input.teamId, input.ticketId, input.token);
    await notify(
        input.teamId,
        input.ticketId,
        input.requesterEmail,
        `We received your request: ${input.subject}`,
        [
            "Thanks — we received your support request. Reply to this email to continue the conversation.",
            `Subject: ${input.subject}`,
            `Or view the ticket: ${url}`,
        ].join("\n\n"),
        `<p>Thanks — we received your support request. Reply to this email to continue the conversation.</p>
<p>Subject: ${escapeHtml(input.subject)}</p>
<p><a href="${url}">View the ticket</a></p>`,
        true,
    );
}

export async function notifyRequesterOfReply(input: {
    teamId: string;
    ticketId: string;
    token: string;
    requesterEmail: string;
    subject: string;
    replyText: string;
}) {
    const url = await threadUrl(input.teamId, input.ticketId, input.token);
    const reply = input.replyText.trim();
    await notify(
        input.teamId,
        input.ticketId,
        input.requesterEmail,
        `Re: ${input.subject}`,
        [
            reply || "You have a new reply on your support ticket.",
            `Reply to this email, or view the ticket: ${url}`,
        ].join("\n\n"),
        `${replyHtml(reply)}
<p>Reply to this email, or <a href="${url}">view the ticket</a>.</p>`,
        true,
    );
}

export async function notifyTeamOfRequesterMessage(input: {
    teamId: string;
    ticketId: string;
    recipientEmail: string;
    subject: string;
}) {
    const url = inboxUrl(input.ticketId);
    await notify(
        input.teamId,
        input.ticketId,
        input.recipientEmail,
        `New message on ticket: ${input.subject}`,
        [
            "A new message was received on a support ticket.",
            `View in the inbox: ${url}`,
        ].join("\n\n"),
        `<p>A new message was received on a support ticket.</p>
<p><a href="${url}">View in the inbox</a></p>`,
    );
}

function replyHtml(reply: string): string {
    if (!reply) {
        return "<p>You have a new reply on your support ticket.</p>";
    }
    return reply
        .split(/\n{2,}/)
        .map(
            (paragraph) =>
                `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`,
        )
        .join("");
}

function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}
