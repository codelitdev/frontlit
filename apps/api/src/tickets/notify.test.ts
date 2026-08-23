import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ticketIdempotencyKey } from "../email/platform-mail-keys";

const { sendPlatformEmail, getDomainSettings, findTeamById, mintReplyToken } =
    vi.hoisted(() => ({
        sendPlatformEmail: vi.fn().mockResolvedValue(undefined),
        getDomainSettings: vi.fn(),
        findTeamById: vi.fn(),
        mintReplyToken: vi.fn(),
    }));

vi.mock("../email/platform-mail", async (importOriginal) => {
    const actual =
        await importOriginal<typeof import("../email/platform-mail")>();
    return { ...actual, sendPlatformEmail };
});
vi.mock("../domains/queries", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../domains/queries")>();
    return { ...actual, getDomainSettings };
});
vi.mock("../team/queries", () => ({ findTeamById }));
vi.mock("../mail/reply-token", () => ({ mintReplyToken }));

import {
    notifyRequesterOfReply,
    notifyRequesterOfTicketCreated,
    notifyTeamOfRequesterMessage,
} from "./notify";

describe("ticket notification emails", () => {
    beforeEach(() => {
        sendPlatformEmail.mockClear();
        getDomainSettings.mockResolvedValue({
            canonicalHost: "acme.localhost",
        });
        findTeamById.mockResolvedValue({
            id: "team_1",
            name: "Acme",
            subdomain: "acme",
        });
        mintReplyToken.mockResolvedValue("abcdefghijklmnopqrstuvwx");
        vi.stubEnv("WEB_BASE_URL", "http://localhost:3000");
        vi.stubEnv("PLATFORM_SITE_DOMAIN", "localhost");
        vi.stubEnv("MAIL_DOMAIN", "localhost");
        vi.stubEnv("INBOUND_EMAIL_DOMAIN", "");
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("emails a confirmation with the magic-link thread URL", async () => {
        await notifyRequesterOfTicketCreated({
            teamId: "team_1",
            ticketId: "tkt_1",
            token: "secret-token",
            requesterEmail: "tester1@frontlit.app",
            subject: "Billing question",
            eventId: "tmsg_created",
        });

        expect(sendPlatformEmail).toHaveBeenCalledWith(
            "ticket-created",
            expect.objectContaining({
                subject: "Billing question",
                ticketUrl:
                    "http://acme.localhost:3002/help/tickets/tkt_1?token=secret-token",
            }),
            expect.objectContaining({
                to: "tester1@frontlit.app",
                subject: "We received your request: Billing question",
                idempotencyKey: ticketIdempotencyKey(
                    "created",
                    "tmsg_created",
                    "tester1@frontlit.app",
                ),
            }),
        );
        const meta = sendPlatformEmail.mock.calls[0][2] as {
            headers?: Record<string, string>;
        };
        expect(meta.headers).not.toHaveProperty("Message-ID");
        expect(meta.headers).not.toHaveProperty("message-id");
    });

    it("emails the requester when an agent replies", async () => {
        await notifyRequesterOfReply({
            teamId: "team_1",
            ticketId: "tkt_1",
            token: "fresh-token",
            requesterEmail: "tester1@frontlit.app",
            subject: "Billing question",
            replyText:
                "Your refund is on the way.\n\nIt should land in 3 days.",
            eventId: "tmsg_reply",
        });

        const [, variables, meta] = sendPlatformEmail.mock.calls[0];
        expect(sendPlatformEmail).toHaveBeenCalledWith(
            "ticket-reply",
            expect.anything(),
            expect.objectContaining({
                to: "tester1@frontlit.app",
                subject: "Re: Billing question",
                idempotencyKey: ticketIdempotencyKey(
                    "reply",
                    "tmsg_reply",
                    "tester1@frontlit.app",
                ),
            }),
        );
        expect((variables as { replyText: string }).replyText).toContain(
            "Your refund is on the way.",
        );
        expect((variables as { replyText: string }).replyText).toContain(
            "It should land in 3 days.",
        );
        expect((variables as { ticketUrl: string }).ticketUrl).toContain(
            "fresh-token",
        );
        expect(meta).not.toHaveProperty("messageId");
    });

    it("dedupes the same article in the source list", async () => {
        await notifyRequesterOfReply({
            teamId: "team_1",
            ticketId: "tkt_1",
            token: "fresh-token",
            requesterEmail: "tester1@frontlit.app",
            subject: "API question",
            replyText: "Use the product API. [1][2][3]",
            sources: [
                { slug: "rest-api", title: "REST API", anchor: "a" },
                { slug: "rest-api", title: "REST API", anchor: "b" },
                { slug: "rest-api", title: "REST API", anchor: "c" },
            ],
            eventId: "tmsg_dedupe",
        });
        const sourcesText = (
            sendPlatformEmail.mock.calls[0][1] as { sourcesText: string }
        ).sourcesText;
        expect(sourcesText.match(/REST API/g)?.length).toBe(1);
    });

    it("passes reply prose and deduplicated source URLs as template variables", async () => {
        await notifyRequesterOfReply({
            teamId: "team_1",
            ticketId: "tkt_1",
            token: "fresh-token",
            requesterEmail: "tester1@frontlit.app",
            subject: "API question",
            replyText: 'Use the product API. [1] <script>alert("x")</script>',
            sources: [
                {
                    slug: "rest-api",
                    title: "REST API For Product and Customer Management",
                    anchor: "overview",
                },
            ],
            eventId: "tmsg_cite",
        });
        const variables = sendPlatformEmail.mock.calls[0][1] as {
            replyText: string;
            sourcesText: string;
        };
        expect(variables.replyText).toContain('<script>alert("x")</script>');
        expect(variables.sourcesText).toBe(
            "1. REST API For Product and Customer Management: http://acme.localhost:3002/docs/rest-api#overview",
        );
    });

    it("puts an opaque reply+ token on Reply-To when inbound domain is set", async () => {
        vi.stubEnv("INBOUND_EMAIL_DOMAIN", "replies.localhost");
        await notifyRequesterOfReply({
            teamId: "team_1",
            ticketId: "tkt_1",
            token: "fresh-token",
            requesterEmail: "tester1@frontlit.app",
            subject: "Billing question",
            replyText: "Working on it.",
            eventId: "tmsg_replyto",
        });
        expect(mintReplyToken).toHaveBeenCalledWith({
            teamId: "team_1",
            ticketPublicId: "tkt_1",
            requesterEmail: "tester1@frontlit.app",
        });
        expect(sendPlatformEmail).toHaveBeenCalledWith(
            "ticket-reply",
            expect.anything(),
            expect.objectContaining({
                replyTo: "reply+abcdefghijklmnopqrstuvwx@replies.localhost",
                headers: {
                    "In-Reply-To": "<tkt_1@acme.localhost>",
                    References: "<tkt_1@acme.localhost>",
                },
            }),
        );
        const meta = sendPlatformEmail.mock.calls[0][2] as Record<
            string,
            unknown
        >;
        expect(meta).not.toHaveProperty("messageId");
        expect(JSON.stringify(meta)).not.toMatch(/Message-ID/i);
    });

    it("emails the team a link into the inbox with an event-derived key", async () => {
        await notifyTeamOfRequesterMessage({
            teamId: "team_1",
            ticketId: "tkt_1",
            recipientEmail: "owner@example.com",
            subject: "Billing question",
            eventId: "tmsg_team",
        });

        expect(sendPlatformEmail).toHaveBeenCalledWith(
            "ticket-requester-message",
            expect.objectContaining({
                inboxUrl: "http://localhost:3000/?ticket=tkt_1",
            }),
            expect.objectContaining({
                to: "owner@example.com",
                subject: "New message on ticket: Billing question",
                idempotencyKey: ticketIdempotencyKey(
                    "requester-message",
                    "tmsg_team",
                    "owner@example.com",
                ),
            }),
        );
    });
});
