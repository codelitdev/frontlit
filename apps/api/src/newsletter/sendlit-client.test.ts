import { afterEach, describe, expect, it, vi } from "vitest";
import {
    createBroadcast,
    testEspConfig,
    toBroadcast,
    updateBroadcast,
    updateGeneralSettings,
    upsertEspConfig,
    type SendlitSequence,
} from "./sendlit-client";

const apiUrl = "https://sendlit.test";

function sequence(overrides: Partial<SendlitSequence> = {}): SendlitSequence {
    return {
        sequenceId: "sequence-1",
        type: "broadcast",
        title: "Blank",
        status: "draft",
        emails: [
            {
                emailId: "email-1",
                subject: "Blank",
                content: { content: [] },
                delayInMillis: 0,
                published: true,
            },
        ],
        createdAt: "2026-07-29T00:00:00.000Z",
        ...overrides,
    };
}

function jsonResponse(body: unknown) {
    return new Response(JSON.stringify(body), {
        headers: { "content-type": "application/json" },
    });
}

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
});

describe("SendLit broadcast adapter", () => {
    it("creates a draft from the marketing starter and maps its first email", async () => {
        vi.stubEnv("SENDLIT_API_URL", apiUrl);
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(jsonResponse(sequence()))
            .mockResolvedValueOnce(jsonResponse(sequence({ title: "Hello!" })))
            .mockResolvedValueOnce(
                jsonResponse(
                    sequence({
                        title: "Hello!",
                        emails: [
                            {
                                ...sequence().emails[0],
                                subject: "Hello!",
                            },
                        ],
                    }),
                ),
            );
        vi.stubGlobal("fetch", fetchMock);

        const broadcast = await createBroadcast("team-key", { name: "Hello!" });

        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            `${apiUrl}/sequences`,
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({
                    type: "broadcast",
                    templateId: "system:blank",
                }),
            }),
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            `${apiUrl}/sequences/sequence-1`,
            expect.objectContaining({
                method: "PATCH",
                body: JSON.stringify({ title: "Hello!" }),
            }),
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            3,
            `${apiUrl}/sequences/sequence-1/emails/email-1`,
            expect.objectContaining({
                method: "PATCH",
                body: JSON.stringify({ subject: "Hello!" }),
            }),
        );
        expect(toBroadcast(broadcast)).toMatchObject({
            broadcastId: "sequence-1",
            name: "Hello!",
            subject: "Hello!",
        });
    });

    it("updates sequence and first-email fields through their distinct SendLit endpoints", async () => {
        vi.stubEnv("SENDLIT_API_URL", apiUrl);
        const current = sequence();
        const renamed = sequence({ title: "July update" });
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(jsonResponse(current))
            .mockResolvedValueOnce(jsonResponse(renamed))
            .mockResolvedValueOnce(
                jsonResponse(
                    sequence({
                        title: "July update",
                        emails: [
                            {
                                ...current.emails[0],
                                subject: "New subject",
                                content: { content: [{ blockType: "text" }] },
                            },
                        ],
                    }),
                ),
            );
        vi.stubGlobal("fetch", fetchMock);

        await updateBroadcast("team-key", "sequence-1", {
            name: "July update",
            subject: "New subject",
            body: { content: [{ blockType: "text" }] },
        });

        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            `${apiUrl}/sequences/sequence-1`,
            expect.objectContaining({
                body: JSON.stringify({ title: "July update" }),
            }),
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            3,
            `${apiUrl}/sequences/sequence-1/emails/email-1`,
            expect.objectContaining({
                body: JSON.stringify({
                    subject: "New subject",
                    content: { content: [{ blockType: "text" }] },
                }),
            }),
        );
    });
});

describe("SendLit ESP adapter", () => {
    it("forwards compliance and write-only ESP credentials to the team-scoped SendLit API", async () => {
        vi.stubEnv("SENDLIT_API_URL", apiUrl);
        const publicConfig = {
            espId: "esp-1",
            name: "Default ESP",
            isDefault: true,
            provider: "resend",
            host: "smtp.resend.com",
            port: 465,
            secure: true,
            username: "resend",
            hasPassword: true,
            fromName: "FrontLit",
            fromEmail: "hello@example.com",
        };
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                jsonResponse({
                    mailingAddress: "123 Main St, Bengaluru, India",
                }),
            )
            .mockResolvedValueOnce(jsonResponse(publicConfig))
            .mockResolvedValueOnce(jsonResponse({ success: true }));
        vi.stubGlobal("fetch", fetchMock);

        await updateGeneralSettings("team-key", {
            mailingAddress: "123 Main St, Bengaluru, India",
        });
        const saved = await upsertEspConfig("team-key", {
            provider: "resend",
            host: "smtp.resend.com",
            port: 465,
            secure: true,
            username: "resend",
            password: "re_secret",
            fromName: "FrontLit",
            fromEmail: "hello@example.com",
        });
        await testEspConfig("team-key", "owner@example.com");

        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            `${apiUrl}/settings/general`,
            expect.objectContaining({
                method: "PUT",
                body: JSON.stringify({
                    mailingAddress: "123 Main St, Bengaluru, India",
                }),
            }),
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            `${apiUrl}/settings/esp`,
            expect.objectContaining({
                method: "PUT",
                headers: expect.objectContaining({
                    "x-sendlit-apikey": "team-key",
                }),
                body: JSON.stringify({
                    provider: "resend",
                    host: "smtp.resend.com",
                    port: 465,
                    secure: true,
                    username: "resend",
                    password: "re_secret",
                    fromName: "FrontLit",
                    fromEmail: "hello@example.com",
                }),
            }),
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            3,
            `${apiUrl}/settings/esp/test`,
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ to: "owner@example.com" }),
            }),
        );
        expect(saved).toEqual(publicConfig);
        expect(saved).not.toHaveProperty("password");
    });
});
