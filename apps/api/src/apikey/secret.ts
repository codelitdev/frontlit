import { createHash, randomBytes } from "node:crypto";

const KEY_PREFIX = "fl_live_";

/** Generates a new API key secret plus its hash + display prefix. The full
 * `secret` is only ever handed back to the caller once, at creation time —
 * only `keyHash` is persisted. */
export function generateApiKey() {
  const raw = randomBytes(24).toString("base64url");
  const secret = `${KEY_PREFIX}${raw}`;
  return {
    secret,
    keyHash: hashApiKey(secret),
    keyPrefix: secret.slice(0, KEY_PREFIX.length + 6),
  };
}

export function hashApiKey(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}
