import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendMail, getDomainSettings, findTeamById, mintReplyToken } =
    vi.hoisted(() => ({
        sendMail: vi.fn().mockResolvedValue(undefined),
        getDomainSettings: vi.fn(),
        findTeamById: vi.fn(),
        mintReplyToken: vi.fn(),
    }));

vi.mock("../utils/mail", () => ({ sendMail }));
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
        sendMail.mockClear();
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
        });

        expect(sendMail).toHaveBeenCalledWith(
            expect.objectContaining({
                to: "tester1@frontlit.app",
                subject: "We received your request: Billing question",
                from: "Acme Support <support@acme.localhost>",
                replyTo: "Acme Support <support@acme.localhost>",
                text: expect.stringContaining(
                    "http://acme.localhost:3002/help/tickets/tkt_1?token=secret-token",
                ),
            }),
        );
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
        });

        expect(sendMail).toHaveBeenCalledWith(
            expect.objectContaining({
                to: "tester1@frontlit.app",
                subject: "Re: Billing question",
                from: "Acme Support <support@acme.localhost>",
                text: expect.stringContaining("Your refund is on the way."),
                html: expect.stringContaining("Your refund is on the way."),
            }),
        );
        expect(sendMail.mock.calls[0][0].text).toContain("fresh-token");
        expect(sendMail.mock.calls[0][0].html).toContain(
            "It should land in 3 days.",
        );
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
        });
        const html = sendMail.mock.calls[0][0].html as string;
        expect(html.match(/REST API/g)?.length).toBe(1);
    });

    it("turns citation markers and the source list into doc links", async () => {
        await notifyRequesterOfReply({
            teamId: "team_1",
            ticketId: "tkt_1",
            token: "fresh-token",
            requesterEmail: "tester1@frontlit.app",
            subject: "API question",
            replyText: "Use the product API. [1]",
            sources: [
                {
                    slug: "rest-api",
                    title: "REST API For Product and Customer Management",
                    anchor: "overview",
                },
            ],
        });
        const html = sendMail.mock.calls[0][0].html as string;
        const text = sendMail.mock.calls[0][0].text as string;
        expect(html).toContain(
            'href="http://acme.localhost:3002/docs/rest-api#overview"',
        );
        expect(html).toContain(">[1]</a>");
        expect(html).toContain("Sources");
        expect(text).toContain(
            "http://acme.localhost:3002/docs/rest-api#overview",
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
        });
        expect(mintReplyToken).toHaveBeenCalledWith({
            teamId: "team_1",
            ticketPublicId: "tkt_1",
            requesterEmail: "tester1@frontlit.app",
        });
        expect(sendMail).toHaveBeenCalledWith(
            expect.objectContaining({
                from: "Acme Support <support@acme.localhost>",
                replyTo: "reply+abcdefghijklmnopqrstuvwx@replies.localhost",
            }),
        );
    });

    it("emails the team a link into the inbox", async () => {
        await notifyTeamOfRequesterMessage({
            teamId: "team_1",
            ticketId: "tkt_1",
            recipientEmail: "owner@example.com",
            subject: "Billing question",
        });

        expect(sendMail).toHaveBeenCalledWith(
            expect.objectContaining({
                to: "owner@example.com",
                subject: "New message on ticket: Billing question",
                from: "Acme Support <support@acme.localhost>",
                text: expect.stringContaining(
                    "http://localhost:3000/?ticket=tkt_1",
                ),
            }),
        );
    });
});
