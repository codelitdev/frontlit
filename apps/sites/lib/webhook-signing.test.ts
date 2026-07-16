import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "./webhook-signing";

function sign(secret: string, body: string, timestamp: number): string {
    return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

describe("verifyWebhookSignature", () => {
    const secret = "test-secret";
    const body = JSON.stringify({ teamId: "team_abc" });

    it("verifies a freshly signed payload", () => {
        const now = Date.now();
        expect(verifyWebhookSignature(secret, body, now, sign(secret, body, now))).toBe(true);
    });

    it("rejects a wrong secret", () => {
        const now = Date.now();
        expect(verifyWebhookSignature(secret, body, now, sign("other", body, now))).toBe(false);
    });

    it("rejects a tampered body", () => {
        const now = Date.now();
        const signature = sign(secret, body, now);
        expect(verifyWebhookSignature(secret, JSON.stringify({ teamId: "hijacked" }), now, signature)).toBe(false);
    });

    it("rejects a stale timestamp outside the replay window", () => {
        const stale = Date.now() - 6 * 60 * 1000;
        expect(verifyWebhookSignature(secret, body, stale, sign(secret, body, stale))).toBe(false);
    });
});
