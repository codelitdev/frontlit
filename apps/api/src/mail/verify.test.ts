import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { verifyGenericSignature, verifyMailgunSignature } from "./verify";

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("inbound webhook signatures", () => {
    it("accepts a valid generic HMAC", () => {
        vi.stubEnv("EMAIL_INBOUND_SECRET", "s3cret");
        const timestamp = String(Date.now());
        const raw = '{"from":"a@b.c","text":"hi"}';
        const signature = createHmac("sha256", "s3cret")
            .update(`${timestamp}.${raw}`)
            .digest("hex");
        expect(verifyGenericSignature(raw, timestamp, signature)).toBe(true);
        expect(verifyGenericSignature(raw, timestamp, "nope")).toBe(false);
    });

    it("accepts a valid Mailgun HMAC", () => {
        vi.stubEnv("MAILGUN_WEBHOOK_SIGNING_KEY", "mg-key");
        const timestamp = String(Math.floor(Date.now() / 1000));
        const token = "tok";
        const signature = createHmac("sha256", "mg-key")
            .update(timestamp + token)
            .digest("hex");
        expect(verifyMailgunSignature({ timestamp, token, signature })).toBe(
            true,
        );
    });
});
