import { logger } from "../services/log";
import {
    sendPlatformEmail,
    ticketIdempotencyKey,
    type PlatformTemplateVariables,
} from "../email/platform-mail";
import { getDomainSettings, getPlatformSiteDomain } from "../domains/queries";
import { findTeamById } from "../team/queries";
import {
    conversationMessageId,
    replyToAddress,
    supportAddress,
} from "../mail/address";
import { inboundEmailDomain } from "../mail/config";
import { mintReplyToken } from "../mail/reply-token";
import { publicContentPath } from "@frontlit/api-contract";

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

export type TicketMailSource = {
    slug: string;
    title: string | null;
    anchor?: string | null;
    kind?: "blog" | "doc" | "changelog";
};

function uniqueMailSources(sources: TicketMailSource[]): TicketMailSource[] {
    const seen = new Set<string>();
    const unique: TicketMailSource[] = [];
    for (const source of sources) {
        if (seen.has(source.slug)) continue;
        seen.add(source.slug);
        unique.push(source);
    }
    return unique;
}

function publicDocUrl(origin: string, source: TicketMailSource): string {
    return `${origin}${publicContentPath(source.kind, source.slug, source.anchor)}`;
}

async function siteOriginForTeam(teamId: string): Promise<string> {
    const settings = await getDomainSettings(teamId);
    return sitesOrigin(settings?.canonicalHost ?? null);
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
): Promise<{ replyTo?: string; headers?: Record<string, string> }> {
    const team = await findTeamById(teamId);
    if (!team?.subdomain) return {};
    const conversation = conversationMessageId(ticketId, team.subdomain);
    let replyTo = supportAddress(team.subdomain);
    if (requesterEmail && inboundEmailDomain()) {
        const token = await mintReplyToken({
            teamId,
            ticketPublicId: ticketId,
            requesterEmail,
        });
        replyTo = (token && replyToAddress(token)) || replyTo;
    }
    return {
        replyTo,
        headers: {
            "In-Reply-To": conversation,
            References: conversation,
        },
    };
}

async function notify(input: {
    templateKey: "ticket-created" | "ticket-reply" | "ticket-requester-message";
    variables:
        | PlatformTemplateVariables["ticket-created"]
        | PlatformTemplateVariables["ticket-reply"]
        | PlatformTemplateVariables["ticket-requester-message"];
    kind: string;
    eventId: string;
    teamId: string;
    ticketId: string;
    to: string;
    subject: string;
    mintReplyTo?: boolean;
}): Promise<void> {
    try {
        await sendPlatformEmail(
            input.templateKey,
            input.variables as PlatformTemplateVariables[typeof input.templateKey],
            {
                to: input.to,
                subject: input.subject,
                idempotencyKey: ticketIdempotencyKey(
                    input.kind,
                    input.eventId,
                    input.to,
                ),
                ...(await mailboxHeaders(
                    input.teamId,
                    input.ticketId,
                    input.mintReplyTo ? input.to : undefined,
                )),
            },
        );
    } catch (err) {
        logger.warn(
            {
                errorType: err instanceof Error ? err.name : typeof err,
            },
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
    eventId: string;
}) {
    const url = await threadUrl(input.teamId, input.ticketId, input.token);
    await notify({
        templateKey: "ticket-created",
        variables: { subject: input.subject, ticketUrl: url },
        kind: "created",
        eventId: input.eventId,
        teamId: input.teamId,
        ticketId: input.ticketId,
        to: input.requesterEmail,
        subject: `We received your request: ${input.subject}`,
        mintReplyTo: true,
    });
}

export async function notifyRequesterOfReply(input: {
    teamId: string;
    ticketId: string;
    token: string;
    requesterEmail: string;
    subject: string;
    replyText: string;
    sources?: TicketMailSource[];
    eventId: string;
}) {
    const url = await threadUrl(input.teamId, input.ticketId, input.token);
    const origin = await siteOriginForTeam(input.teamId);
    const reply =
        input.replyText.trim() ||
        "You have a new reply on your support ticket.";
    const sources = uniqueMailSources(input.sources ?? []);
    await notify({
        templateKey: "ticket-reply",
        variables: {
            replyText: reply,
            ticketUrl: url,
            sourcesText: sourcesText(sources, origin),
        },
        kind: "reply",
        eventId: input.eventId,
        teamId: input.teamId,
        ticketId: input.ticketId,
        to: input.requesterEmail,
        subject: `Re: ${input.subject}`,
        mintReplyTo: true,
    });
}

export async function notifyTeamOfRequesterMessage(input: {
    teamId: string;
    ticketId: string;
    recipientEmail: string;
    subject: string;
    eventId: string;
}) {
    const url = inboxUrl(input.ticketId);
    await notify({
        templateKey: "ticket-requester-message",
        variables: { inboxUrl: url },
        kind: "requester-message",
        eventId: input.eventId,
        teamId: input.teamId,
        ticketId: input.ticketId,
        to: input.recipientEmail,
        subject: `New message on ticket: ${input.subject}`,
    });
}

function sourcesText(sources: TicketMailSource[], origin: string): string {
    return sources
        .map(
            (source, index) =>
                `${index + 1}. ${source.title ?? source.slug}: ${publicDocUrl(origin, source)}`,
        )
        .join("\n");
}
