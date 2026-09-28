import { createHmac, timingSafeEqual } from "node:crypto";
import { inboundMailSecret, mailgunSigningKey } from "./config";

export function verifyGenericSignature(
  rawBody: string,
  timestamp: string | undefined,
  signature: string | undefined,
): boolean {
  const secret = inboundMailSecret();
  if (!secret) return process.env.NODE_ENV !== "production";
  if (!timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() - ts) > 5 * 60 * 1000) return false;
  const expected = createHmac("sha256", secret)
    .update(`${ts}.${rawBody}`)
    .digest("hex");
  return safeEqual(expected, signature);
}

export function verifyMailgunSignature(input: {
  timestamp?: string;
  token?: string;
  signature?: string;
}): boolean {
  const key = mailgunSigningKey();
  if (!key) return false;
  if (!input.timestamp || !input.token || !input.signature) return false;
  const ts = Number(input.timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() / 1000 - ts) > 5 * 60) return false;
  const expected = createHmac("sha256", key)
    .update(input.timestamp + input.token)
    .digest("hex");
  return safeEqual(expected, input.signature);
}

function safeEqual(expected: string, actual: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
