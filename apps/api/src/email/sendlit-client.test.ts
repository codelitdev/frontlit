import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "../services/log";
import {
    createSendlitTeamKey,
    createBroadcast,
    deleteBroadcast,
    getSendlitSendingOptions,
    listBroadcasts,
    listEmailTemplates,
    listSendlitEmailTemplates,
    listSystemEmailTemplates,
    provisionSendlitTeam,
    sendEmail,
    SendlitApiError,
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

describe("SendLit provisioning adapter", () => {
    it("uses the scoped organization key as a Bearer token", async () => {
        vi.stubEnv("SENDLIT_API_URL", apiUrl);
        vi.stubEnv("SENDLIT_ORGANIZATION_API_KEY", "sl_org_live_test");
        const fetchMock = vi.fn().mockResolvedValue(
            jsonResponse({
                teamId: "team-1",
                name: "Acme",
                apiKey: "sl_live_team",
            }),
        );
        vi.stubGlobal("fetch", fetchMock);

        await provisionSendlitTeam({ externalId: "fl_team_1", name: "Acme" });

        expect(fetchMock).toHaveBeenCalledWith(
            `${apiUrl}/provisioning/teams`,
            expect.objectContaining({
                method: "POST",
                headers: expect.objectContaining({
                    authorization: "Bearer sl_org_live_test",
                }),
                body: JSON.stringify({ externalId: "fl_team_1", name: "Acme" }),
            }),
        );
    });

    it("mints a replacement team key after interrupted provisioning", async () => {
        vi.stubEnv("SENDLIT_API_URL", apiUrl);
        vi.stubEnv("SENDLIT_ORGANIZATION_API_KEY", "sl_org_live_test");
        const fetchMock = vi
            .fn()
            .mockResolvedValue(jsonResponse({ key: "sl_live_replacement" }));
        vi.stubGlobal("fetch", fetchMock);

        await expect(createSendlitTeamKey("team-1")).resolves.toBe(
            "sl_live_replacement",
        );

        expect(fetchMock).toHaveBeenCalledWith(
            `${apiUrl}/provisioning/teams/team-1/keys`,
            expect.objectContaining({
                method: "POST",
                headers: expect.objectContaining({
                    authorization: "Bearer sl_org_live_test",
                }),
                body: JSON.stringify({ name: "FrontLit integration" }),
            }),
        );
    });
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
        const withSubject = sequence({
            title: "July update",
            emails: [
                {
                    ...current.emails[0],
                    subject: "New subject",
                    content: { content: [{ blockType: "text" }] },
                },
            ],
        });
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(jsonResponse(current))
            .mockResolvedValueOnce(jsonResponse(renamed))
            .mockResolvedValueOnce(jsonResponse(withSubject))
            .mockResolvedValueOnce(jsonResponse(withSubject));
        vi.stubGlobal("fetch", fetchMock);

        await updateBroadcast("team-key", "sequence-1", {
            name: "July update",
            subject: "New subject",
            body: { content: [{ blockType: "text" }] },
            filter: {
                aggregator: "and",
                filters: [{ name: "tag", condition: "is", value: "customers" }],
            },
        });

        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            `${apiUrl}/sequences/sequence-1`,
            expect.objectContaining({
                method: "PATCH",
                body: JSON.stringify({
                    title: "July update",
                    filter: {
                        aggregator: "and",
                        filters: [
                            {
                                name: "tag",
                                condition: "is",
                                value: "customers",
                            },
                        ],
                    },
                }),
            }),
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            3,
            `${apiUrl}/sequences/sequence-1/emails/email-1`,
            expect.objectContaining({
                method: "PATCH",
                body: JSON.stringify({
                    subject: "New subject",
                    content: { content: [{ blockType: "text" }] },
                }),
            }),
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            4,
            `${apiUrl}/sequences/sequence-1`,
            expect.objectContaining({
                method: "GET",
            }),
        );
    });

    it("deletes a broadcast through SendLit's sequence endpoint", async () => {
        vi.stubEnv("SENDLIT_API_URL", apiUrl);
        const fetchMock = vi
            .fn()
            .mockResolvedValue(new Response(null, { status: 204 }));
        vi.stubGlobal("fetch", fetchMock);

        await deleteBroadcast("team-key", "sequence-1");

        expect(fetchMock).toHaveBeenCalledWith(
            `${apiUrl}/sequences/sequence-1`,
            expect.objectContaining({ method: "DELETE" }),
        );
    });

    it("lists SendLit system marketing templates", async () => {
        vi.stubEnv("SENDLIT_API_URL", apiUrl);
        const fetchMock = vi.fn().mockResolvedValue(
            jsonResponse({
                items: [
                    {
                        templateId: "system:blank",
                        title: "Blank",
                        description: "A blank starter",
                        content: { content: [] },
                    },
                ],
            }),
        );
        vi.stubGlobal("fetch", fetchMock);

        await expect(listSystemEmailTemplates("team-key")).resolves.toEqual([
            {
                templateId: "system:blank",
                title: "Blank",
                description: "A blank starter",
                body: { content: [] },
            },
        ]);
        expect(fetchMock).toHaveBeenCalledWith(
            `${apiUrl}/system-templates?purpose=marketing`,
            expect.objectContaining({ method: "GET" }),
        );
    });
});

describe("SendLit ESP adapter", () => {
    const publicConfig = {
        espId: "esp-1",
        name: "FrontLit Default",
        provider: "resend",
        host: "smtp.resend.com",
        port: 465,
        secure: true,
        username: "resend",
        hasPassword: true,
        fromName: "FrontLit",
        fromEmail: "hello@example.com",
        status: "draft" as const,
    };

    it("creates FrontLit's singleton ESP through SendLit's collection API", async () => {
        vi.stubEnv("SENDLIT_API_URL", apiUrl);
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(jsonResponse({ items: [] }))
            .mockResolvedValueOnce(
                jsonResponse({
                    defaultSource: null,
                    defaultTeamEspId: null,
                }),
            )
            .mockResolvedValueOnce(jsonResponse(publicConfig));
        vi.stubGlobal("fetch", fetchMock);

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

        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            `${apiUrl}/settings/esps`,
            expect.objectContaining({
                method: "GET",
            }),
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            `${apiUrl}/settings/delivery`,
            expect.objectContaining({ method: "GET" }),
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            3,
            `${apiUrl}/settings/esps`,
            expect.objectContaining({
                method: "POST",
                headers: expect.objectContaining({
                    "x-sendlit-apikey": "team-key",
                }),
                body: JSON.stringify({
                    name: "FrontLit Default",
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
        expect(saved).toEqual({ ...publicConfig, isDefault: false });
        expect(saved).not.toHaveProperty("password");
    });

    it("activates and selects a draft ESP after its test succeeds", async () => {
        vi.stubEnv("SENDLIT_API_URL", apiUrl);
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(jsonResponse({ items: [publicConfig] }))
            .mockResolvedValueOnce(
                jsonResponse({
                    defaultSource: null,
                    defaultTeamEspId: null,
                }),
            )
            .mockResolvedValueOnce(jsonResponse({ success: true }))
            .mockResolvedValueOnce(
                jsonResponse({ ...publicConfig, status: "active" }),
            )
            .mockResolvedValueOnce(
                jsonResponse({
                    defaultSource: "team",
                    defaultTeamEspId: "esp-1",
                }),
            );
        vi.stubGlobal("fetch", fetchMock);

        await expect(
            testEspConfig("team-key", "owner@example.com"),
        ).resolves.toEqual({ success: true });

        expect(fetchMock).toHaveBeenNthCalledWith(
            3,
            `${apiUrl}/settings/esps/esp-1/test`,
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ to: "owner@example.com" }),
            }),
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            4,
            `${apiUrl}/settings/esps/esp-1/activate`,
            expect.objectContaining({ method: "POST" }),
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            5,
            `${apiUrl}/settings/delivery`,
            expect.objectContaining({
                method: "PATCH",
                body: JSON.stringify({
                    deliverySource: { type: "team", espId: "esp-1" },
                }),
            }),
        );
    });

    it("keeps compliance settings on SendLit's general settings endpoint", async () => {
        vi.stubEnv("SENDLIT_API_URL", apiUrl);
        const fetchMock = vi.fn().mockResolvedValueOnce(
            jsonResponse({
                mailingAddress: "123 Main St, Bengaluru, India",
            }),
        );
        vi.stubGlobal("fetch", fetchMock);

        await updateGeneralSettings("team-key", {
            mailingAddress: "123 Main St, Bengaluru, India",
        });

        expect(fetchMock).toHaveBeenCalledWith(
            `${apiUrl}/settings/general`,
            expect.objectContaining({
                method: "PUT",
                body: JSON.stringify({
                    mailingAddress: "123 Main St, Bengaluru, India",
                }),
            }),
        );
    });
});

describe("SendLit platform client", () => {
    it("lists templates without a default purpose and preserves purpose on the raw DTO", async () => {
        vi.stubEnv("SENDLIT_API_URL", apiUrl);
        const rows = [
            {
                templateId: "tpl_1",
                title: "FrontLit: Sign-in code",
                purpose: "transactional",
                content: { content: [] },
            },
            {
                templateId: "tpl_2",
                title: "Welcome",
                purpose: "marketing",
                content: { content: [] },
            },
        ];
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(rows));
        vi.stubGlobal("fetch", fetchMock);

        await expect(listSendlitEmailTemplates("team-key")).resolves.toEqual(
            rows,
        );
        expect(fetchMock).toHaveBeenCalledWith(
            `${apiUrl}/templates`,
            expect.objectContaining({
                method: "GET",
                headers: expect.objectContaining({
                    "x-sendlit-apikey": "team-key",
                }),
            }),
        );
        expect(fetchMock.mock.calls[0][1].signal).toBeUndefined();

        fetchMock.mockResolvedValueOnce(
            jsonResponse(rows.filter((row) => row.purpose === "marketing")),
        );
        const marketing = await listEmailTemplates("team-key");
        expect(marketing[0]).not.toHaveProperty("purpose");
        expect(fetchMock).toHaveBeenLastCalledWith(
            `${apiUrl}/templates?purpose=marketing`,
            expect.anything(),
        );
    });

    it("parses JSON error codes and Retry-After without logging secrets", async () => {
        vi.stubEnv("SENDLIT_API_URL", apiUrl);
        const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
        const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ error: "too_many_requests" }), {
                status: 429,
                headers: {
                    "content-type": "application/json",
                    "retry-after": "12",
                },
            }),
        );
        vi.stubGlobal("fetch", fetchMock);
        await expect(
            sendEmail(
                "sl_live_secret",
                {
                    to: "ada@example.com",
                    subject: "Hi",
                    templateId: "tpl_1",
                    variables: { otp: "999999" },
                    idempotencyKey: "k",
                },
                { timeoutMs: 5000 },
            ),
        ).rejects.toMatchObject({
            name: "SendlitApiError",
            status: 429,
            errorCode: "too_many_requests",
            retryAfter: "12",
        });
        const logged = JSON.stringify([
            ...errorSpy.mock.calls,
            ...warnSpy.mock.calls,
        ]);
        expect(logged).not.toContain("sl_live_secret");
        expect(logged).not.toContain("999999");
        expect(fetchMock.mock.calls[0][1].signal).toBeDefined();
        errorSpy.mockRestore();
        warnSpy.mockRestore();
    });

    it("sanitizes non-JSON errors and maps timeouts", async () => {
        vi.stubEnv("SENDLIT_API_URL", apiUrl);
        const fetchMock = vi.fn().mockResolvedValue(
            new Response("<html>upstream</html>", {
                status: 502,
                headers: { "content-type": "text/html" },
            }),
        );
        vi.stubGlobal("fetch", fetchMock);
        await expect(getSendlitSendingOptions("team-key")).rejects.toEqual(
            expect.objectContaining({
                status: 502,
                errorCode: undefined,
            }),
        );

        const timeout = Object.assign(new Error("aborted"), {
            name: "TimeoutError",
        });
        fetchMock.mockRejectedValueOnce(timeout);
        await expect(
            getSendlitSendingOptions("team-key", { timeoutMs: 5 }),
        ).rejects.toSatisfy(
            (error: unknown) =>
                error instanceof SendlitApiError &&
                error.message.includes("timed out"),
        );
    });

    it("does not add an implicit timeout to tenant-facing requests", async () => {
        vi.stubEnv("SENDLIT_API_URL", apiUrl);
        const fetchMock = vi
            .fn()
            .mockResolvedValue(jsonResponse({ items: [] }));
        vi.stubGlobal("fetch", fetchMock);
        await listBroadcasts("team-key");
        expect(fetchMock.mock.calls[0][1].signal).toBeUndefined();
    });
});
