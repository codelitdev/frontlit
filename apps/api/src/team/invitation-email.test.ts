import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invitationIdempotencyKey } from "../email/platform-mail-keys";

const sendPlatformEmail = vi.hoisted(() =>
    vi.fn().mockResolvedValue(undefined),
);

vi.mock("../email/platform-mail", async (importOriginal) => {
    const actual =
        await importOriginal<typeof import("../email/platform-mail")>();
    return { ...actual, sendPlatformEmail };
});

import { sendInvitationEmail } from "./invitation-email";

const base = {
    to: "ada@example.com",
    teamName: "Acme",
    inviterName: "Ada",
    expiresAt: new Date("2026-09-01T00:00:00.000Z"),
    acceptUrl: "http://localhost:3000/team-invitations/tinv_1#token=raw",
    invitationId: "tinv_1",
    tokenHash: "hash-one",
};

describe("sendInvitationEmail", () => {
    beforeEach(() => {
        sendPlatformEmail.mockClear();
        sendPlatformEmail.mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("reuses invitationId+tokenHash across retries and changes it after rotation", async () => {
        await sendInvitationEmail(base);
        await sendInvitationEmail(base);
        const first = sendPlatformEmail.mock.calls[0][2].idempotencyKey;
        const second = sendPlatformEmail.mock.calls[1][2].idempotencyKey;
        expect(first).toBe(
            invitationIdempotencyKey(base.invitationId, base.tokenHash),
        );
        expect(second).toBe(first);

        await sendInvitationEmail({ ...base, tokenHash: "hash-rotated" });
        expect(sendPlatformEmail.mock.calls[2][2].idempotencyKey).not.toBe(
            first,
        );
        expect(sendPlatformEmail.mock.calls[2][2].idempotencyKey).toBe(
            invitationIdempotencyKey(base.invitationId, "hash-rotated"),
        );
    });

    it("passes invitation template variables including the optional inviter", async () => {
        await sendInvitationEmail({ ...base, inviterName: null });
        expect(sendPlatformEmail).toHaveBeenCalledWith(
            "invitation",
            expect.objectContaining({
                teamName: "Acme",
                inviteeEmail: "ada@example.com",
                acceptUrl: base.acceptUrl,
            }),
            expect.objectContaining({
                to: "ada@example.com",
                subject: "Join Acme on FrontLit",
            }),
        );
        expect(sendPlatformEmail.mock.calls[0][1].inviterName).toBeUndefined();
    });
});
