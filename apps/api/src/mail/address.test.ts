import { afterEach, describe, expect, it, vi } from "vitest";
import {
    conversationMessageId,
    extractTicketId,
    parseReplyRecipient,
    parseSupportRecipient,
    replyToAddress,
    supportAddress,
} from "./address";

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("support mailbox addressing", () => {
    it("builds support@<subdomain>.<mail-domain>", () => {
        vi.stubEnv("MAIL_DOMAIN", "frontlit.app");
        expect(supportAddress("acme")).toBe("support@acme.frontlit.app");
    });

    it("parses plus-addressed ticket ids", () => {
        vi.stubEnv("MAIL_DOMAIN", "frontlit.app");
        expect(
            parseSupportRecipient(
                "Acme Support <support+tkt_abc123@acme.frontlit.app>",
            ),
        ).toEqual({ subdomain: "acme", ticketId: "tkt_abc123" });
    });

    it("rejects mailboxes on another domain", () => {
        vi.stubEnv("MAIL_DOMAIN", "frontlit.app");
        expect(parseSupportRecipient("support@acme.example.com")).toBeNull();
    });

    it("builds and parses reply+ tokens on the inbound domain", () => {
        vi.stubEnv("INBOUND_EMAIL_DOMAIN", "replies.frontlit.app");
        const token = "abcdefghijklmnopqrstuvwx";
        expect(replyToAddress(token)).toBe(
            "reply+abcdefghijklmnopqrstuvwx@replies.frontlit.app",
        );
        expect(
            parseReplyRecipient(`Name <reply+${token}@replies.frontlit.app>`),
        ).toBe(token);
        expect(
            parseReplyRecipient(`reply+${token}@replies.example.com`),
        ).toBeNull();
    });

    it("pulls a ticket id out of threading headers", () => {
        expect(
            extractTicketId(
                "<tkt_abc123.deadbeef@acme.frontlit.app>",
                "Re: Hello",
            ),
        ).toBe("tkt_abc123");
        expect(
            conversationMessageId("tkt_abc123", "acme").includes("tkt_abc123"),
        ).toBe(true);
    });
});
