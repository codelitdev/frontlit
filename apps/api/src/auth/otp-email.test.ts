import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb } from "../test/db";

const sendPlatformEmail = vi.hoisted(() =>
    vi.fn().mockResolvedValue(undefined),
);

vi.mock("../db/client", async () => ({ db: await makeTestDb() }));

vi.mock("../email/platform-mail", async (importOriginal) => {
    const actual =
        await importOriginal<typeof import("../email/platform-mail")>();
    return { ...actual, sendPlatformEmail };
});

import { sendVerificationOTP } from "./better-auth";

describe("sendVerificationOTP", () => {
    beforeEach(() => {
        sendPlatformEmail.mockClear();
        sendPlatformEmail.mockResolvedValue(undefined);
    });

    it("reuses one UUID for every attempt inside a callback and issues a new key on a later invocation", async () => {
        await sendVerificationOTP({ email: "ada@example.com", otp: "123456" });
        await sendVerificationOTP({ email: "ada@example.com", otp: "123456" });

        const first = sendPlatformEmail.mock.calls[0][2]
            .idempotencyKey as string;
        const second = sendPlatformEmail.mock.calls[1][2]
            .idempotencyKey as string;
        expect(first).toMatch(/^frontlit:otp:[0-9a-f-]{36}$/i);
        expect(second).toMatch(/^frontlit:otp:[0-9a-f-]{36}$/i);
        expect(first).not.toBe(second);
        expect(sendPlatformEmail).toHaveBeenNthCalledWith(
            1,
            "otp",
            { otp: "123456" },
            expect.objectContaining({
                to: "ada@example.com",
                subject: "Your FrontLit verification code",
            }),
        );
    });
});
