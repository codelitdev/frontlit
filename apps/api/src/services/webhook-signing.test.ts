import { describe, expect, it } from "vitest";
import { signWebhookPayload, verifyWebhookSignature } from "./webhook-signing";

describe("webhook signing", () => {
    const secret = "test-secret";
    const body = JSON.stringify({ teamId: "team_abc" });

    it("verifies a freshly signed payload", () => {
        const now = Date.now();
        const signature = signWebhookPayload(secret, body, now);
        expect(verifyWebhookSignature(secret, body, now, signature)).toBe(true);
    });

    it("rejects a wrong secret", () => {
        const now = Date.now();
        const signature = signWebhookPayload("other-secret", body, now);
        expect(verifyWebhookSignature(secret, body, now, signature)).toBe(false);
    });

    it("rejects a tampered body", () => {
        const now = Date.now();
        const signature = signWebhookPayload(secret, body, now);
        expect(verifyWebhookSignature(secret, JSON.stringify({ teamId: "team_hijacked" }), now, signature)).toBe(false);
    });

    it("rejects a timestamp outside the ±5 minute replay window", () => {
        const stale = Date.now() - 6 * 60 * 1000;
        const signature = signWebhookPayload(secret, body, stale);
        expect(verifyWebhookSignature(secret, body, stale, signature)).toBe(false);
    });

    it("accepts a timestamp just inside the replay window", () => {
        const recent = Date.now() - 4 * 60 * 1000;
        const signature = signWebhookPayload(secret, body, recent);
        expect(verifyWebhookSignature(secret, body, recent, signature)).toBe(true);
    });
});
