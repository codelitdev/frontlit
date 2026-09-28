import { createHmac, timingSafeEqual } from "node:crypto";

/** Generic HMAC-SHA256 signer for server-to-server webhooks (architecture.md
 * §13.4) — "webhooks are HMAC-signed with per-purpose secrets and include
 * timestamps (±5 min replay window)". Shared by every outbound webhook
 * (currently just the ISR revalidation ping to apps/sites) so the
 * sign/verify contract stays identical everywhere it's used. */
export function signWebhookPayload(
  secret: string,
  rawBody: string,
  timestamp: number,
): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

const REPLAY_WINDOW_MS = 5 * 60 * 1000;

export function verifyWebhookSignature(
  secret: string,
  rawBody: string,
  timestamp: number,
  signature: string,
): boolean {
  if (Math.abs(Date.now() - timestamp) > REPLAY_WINDOW_MS) return false;

  const expected = signWebhookPayload(secret, rawBody, timestamp);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signature, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
