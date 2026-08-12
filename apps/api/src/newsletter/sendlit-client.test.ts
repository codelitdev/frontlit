import { afterEach, describe, expect, it, vi } from "vitest";
import {
    createSendlitTeamKey,
    createBroadcast,
    provisionSendlitTeam,
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
