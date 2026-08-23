import { createHash, randomUUID } from "node:crypto";

export function newOtpIdempotencyKey(): string {
    return `frontlit:otp:${randomUUID()}`;
}

export function invitationIdempotencyKey(
    invitationId: string,
    tokenHash: string,
): string {
    const digest = createHash("sha256")
        .update(`${invitationId}\0${tokenHash}`)
        .digest("hex");
    return `frontlit:invitation:${digest}`;
}

export function ticketIdempotencyKey(
    kind: string,
    eventId: string,
    recipient: string,
): string {
    const digest = createHash("sha256")
        .update(`${kind}\0${eventId}\0${recipient}`)
        .digest("hex");
    return `frontlit:ticket:${digest}`;
}
