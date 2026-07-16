import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Generates a new magic-link ticket access token. The raw `token` is only
 * ever handed back to the caller once (embedded in the thread link URL and
 * the notification email) — only `tokenHash` is persisted. */
export function generateTicketToken() {
    const token = randomBytes(32).toString("base64url");
    return { token, tokenHash: hashTicketToken(token) };
}

export function hashTicketToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

/** Constant-time comparison of a visitor-supplied token against the stored
 * hash, per architecture.md §13.4. */
export function verifyTicketToken(token: string, tokenHash: string): boolean {
    const candidate = hashTicketToken(token);
    const a = Buffer.from(candidate, "hex");
    const b = Buffer.from(tokenHash, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
}
