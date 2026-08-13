import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_BYTES = 32;

export function generateInvitationToken(): { raw: string; hash: string } {
    const raw = randomBytes(TOKEN_BYTES).toString("base64url");
    return { raw, hash: hashInvitationToken(raw) };
}

export function hashInvitationToken(raw: string): string {
    return createHash("sha256").update(raw, "utf8").digest("hex");
}

export function invitationTokensMatch(
    raw: string,
    storedHash: string,
): boolean {
    const actual = Buffer.from(hashInvitationToken(raw), "utf8");
    const expected = Buffer.from(storedHash, "utf8");
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
}

export function normalizeInvitationEmail(email: string): string {
    return email.trim().toLowerCase();
}
