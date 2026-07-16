import { createHmac, timingSafeEqual } from "node:crypto";

/** Verifies the HMAC-SHA256 signature apps/api's `services/revalidate.ts`
 * sends on the ISR revalidation webhook (architecture.md §13.4) — same
 * `sign(secret, timestamp.body)` + ±5 minute replay window contract,
 * independently implemented here since apps/api and apps/sites don't share
 * a server-code dependency. */
const REPLAY_WINDOW_MS = 5 * 60 * 1000;

export function verifyWebhookSignature(secret: string, rawBody: string, timestamp: number, signature: string): boolean {
    if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > REPLAY_WINDOW_MS) return false;

    const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(signature, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
}
