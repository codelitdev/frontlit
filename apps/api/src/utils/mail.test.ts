import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MailDeliveryError, MailNotConfiguredError, sendMail } from "./mail";

const sendMailMock = vi.fn();
const createTransportMock = vi.fn((_options?: unknown) => ({
    sendMail: sendMailMock,
}));

vi.mock("nodemailer", () => ({
    createTransport: (options: unknown) => createTransportMock(options),
}));

const message = {
    to: "ada@example.com",
    subject: "Hello",
    text: "plain",
    html: "<p>html</p>",
};

beforeEach(() => {
    sendMailMock.mockReset();
    createTransportMock.mockClear();
    sendMailMock.mockResolvedValue(undefined);
});

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("sendMail", () => {
    it("dumps the message when SMTP is unset outside production", async () => {
        vi.stubEnv("NODE_ENV", "test");
        vi.stubEnv("EMAIL_HOST", "");
        vi.stubEnv("EMAIL_USER", "");
        const log = vi.spyOn(console, "log").mockImplementation(() => {});

        await sendMail(message);

        expect(log).toHaveBeenCalledWith("[Dev] Email", message);
        expect(createTransportMock).not.toHaveBeenCalled();
        expect(sendMailMock).not.toHaveBeenCalled();
        log.mockRestore();
    });

    it("throws MailNotConfiguredError when production SMTP env is missing", async () => {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("EMAIL_HOST", "");
        vi.stubEnv("EMAIL_USER", "");

        await expect(sendMail(message)).rejects.toBeInstanceOf(
            MailNotConfiguredError,
        );
        expect(createTransportMock).not.toHaveBeenCalled();
    });

    it("sends through nodemailer when SMTP is configured", async () => {
        vi.stubEnv("NODE_ENV", "test");
        vi.stubEnv("EMAIL_HOST", "smtp.example.com");
        vi.stubEnv("EMAIL_PORT", "2525");
        vi.stubEnv("EMAIL_USER", "mailer");
        vi.stubEnv("EMAIL_PASS", "secret");
        vi.stubEnv("EMAIL_FROM", "FrontLit <noreply@example.com>");

        await sendMail(message);

        expect(createTransportMock).toHaveBeenCalledWith({
            host: "smtp.example.com",
            port: 2525,
            auth: { user: "mailer", pass: "secret" },
        });
        expect(sendMailMock).toHaveBeenCalledWith({
            from: "FrontLit <noreply@example.com>",
            replyTo: undefined,
            messageId: undefined,
            inReplyTo: undefined,
            references: undefined,
            to: message.to,
            subject: message.subject,
            text: message.text,
            html: message.html,
        });
    });

    it("wraps transport failures as MailDeliveryError", async () => {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("EMAIL_HOST", "smtp.example.com");
        vi.stubEnv("EMAIL_USER", "mailer");
        sendMailMock.mockRejectedValue(new Error("ECONNREFUSED"));

        await expect(sendMail(message)).rejects.toBeInstanceOf(
            MailDeliveryError,
        );
    });
});
