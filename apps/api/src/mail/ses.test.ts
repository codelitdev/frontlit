import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    buildSnsSigningString,
    mailFromSesNotification,
    parseSnsMessage,
    SesInboundError,
    verifySnsMessage,
    type SnsMessage,
} from "./ses";

afterEach(() => {
    vi.unstubAllEnvs();
});

function signedNotification(overrides: Partial<SnsMessage> = {}) {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
        modulusLength: 2048,
    });
    const message: SnsMessage = {
        Type: "Notification",
        MessageId: "msg-1",
        TopicArn: "arn:aws:sns:us-east-1:123:frontlit-inbound",
        Message: JSON.stringify({ notificationType: "Received" }),
        Timestamp: "2026-01-01T00:00:00.000Z",
        SignatureVersion: "2",
        SigningCertURL:
            "https://sns.us-east-1.amazonaws.com/SimpleNotificationService.pem",
        Signature: "",
        ...overrides,
    };
    const payload = buildSnsSigningString(message);
    message.Signature = sign(
        "RSA-SHA256",
        Buffer.from(payload),
        privateKey,
    ).toString("base64");
    return { message, publicKey };
}

describe("SES inbound", () => {
    it("verifies an SNS SignatureVersion 2 payload", async () => {
        vi.stubEnv(
            "EMAIL_SES_TOPIC_ARN",
            "arn:aws:sns:us-east-1:123:frontlit-inbound",
        );
        vi.stubEnv("EMAIL_SES_BUCKET", "frontlit-inbound");
        vi.stubEnv("EMAIL_SES_REGION", "us-east-1");
        const { message, publicKey } = signedNotification();
        await expect(
            verifySnsMessage(message, async () => publicKey),
        ).resolves.toBeUndefined();
    });

    it("rejects a message from the wrong topic", async () => {
        vi.stubEnv("EMAIL_SES_TOPIC_ARN", "arn:aws:sns:us-east-1:123:other");
        vi.stubEnv("EMAIL_SES_BUCKET", "frontlit-inbound");
        vi.stubEnv("EMAIL_SES_REGION", "us-east-1");
        const { message, publicKey } = signedNotification();
        await expect(
            verifySnsMessage(message, async () => publicKey),
        ).rejects.toMatchObject({ kind: "authentication" });
    });

    it("reads raw MIME from the SES S3 object", async () => {
        vi.stubEnv(
            "EMAIL_SES_TOPIC_ARN",
            "arn:aws:sns:us-east-1:123:frontlit-inbound",
        );
        vi.stubEnv("EMAIL_SES_BUCKET", "frontlit-inbound");
        vi.stubEnv("EMAIL_SES_REGION", "us-east-1");
        vi.stubEnv("EMAIL_SES_PREFIX", "inbound");
        const mime = [
            "From: casey@example.com",
            "To: support@acme.frontlit.app",
            "Subject: Help",
            "",
            "The site is down.",
        ].join("\r\n");
        const notification = JSON.stringify({
            notificationType: "Received",
            mail: { messageId: "abc" },
            receipt: {
                action: {
                    type: "S3",
                    bucketName: "frontlit-inbound",
                    objectKey: "inbound/abc",
                },
            },
        });
        const mail = await mailFromSesNotification(notification, async () =>
            Buffer.from(mime),
        );
        expect(mail).toMatchObject({
            from: "casey@example.com",
            subject: "Help",
            text: "The site is down.",
        });
    });

    it("rejects an S3 key outside the configured prefix", async () => {
        vi.stubEnv(
            "EMAIL_SES_TOPIC_ARN",
            "arn:aws:sns:us-east-1:123:frontlit-inbound",
        );
        vi.stubEnv("EMAIL_SES_BUCKET", "frontlit-inbound");
        vi.stubEnv("EMAIL_SES_REGION", "us-east-1");
        vi.stubEnv("EMAIL_SES_PREFIX", "inbound");
        const notification = JSON.stringify({
            mail: {},
            receipt: {
                action: {
                    bucketName: "frontlit-inbound",
                    objectKey: "other/abc",
                },
            },
        });
        await expect(
            mailFromSesNotification(notification),
        ).rejects.toBeInstanceOf(SesInboundError);
    });

    it("parses a raw SNS envelope", () => {
        const raw = JSON.stringify({
            Type: "Notification",
            MessageId: "1",
            TopicArn: "arn:aws:sns:us-east-1:123:frontlit-inbound",
            Message: "{}",
            Timestamp: "t",
            SignatureVersion: "2",
            SigningCertURL: "https://sns.us-east-1.amazonaws.com/x.pem",
            Signature: "abc",
        });
        expect(parseSnsMessage(raw).Type).toBe("Notification");
    });
});
