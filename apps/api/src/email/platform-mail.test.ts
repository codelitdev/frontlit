import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "../services/log";
import { resetCounters } from "../services/metrics";
import type { SendlitEmailTemplate } from "./sendlit-client";
import { PLATFORM_TEMPLATES } from "./platform-templates";

const http = vi.hoisted(() => ({
    listTemplates: vi.fn(),
    createTemplate: vi.fn(),
    updateTemplate: vi.fn(),
    sendingOptions: vi.fn(),
    generalSettings: vi.fn(),
    sendEmail: vi.fn(),
}));

vi.mock("./sendlit-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./sendlit-client")>();
    return {
        ...actual,
        listSendlitEmailTemplates: (...args: unknown[]) =>
            http.listTemplates(...args),
        createSendlitEmailTemplate: (...args: unknown[]) =>
            http.createTemplate(...args),
        updateSendlitEmailTemplate: (...args: unknown[]) =>
            http.updateTemplate(...args),
        getSendlitSendingOptions: (...args: unknown[]) =>
            http.sendingOptions(...args),
        getGeneralSettings: (...args: unknown[]) =>
            http.generalSettings(...args),
        sendEmail: (...args: unknown[]) => http.sendEmail(...args),
    };
});

import {
    MailDeliveryError,
    ensurePlatformMailReady,
    getPlatformMailReadiness,
    resetPlatformMailStateForTests,
    sendPlatformEmail,
    setPlatformMailSleepForTests,
    startPlatformMailBackgroundInit,
} from "./platform-mail";
import { SendlitApiError } from "./sendlit-client";

function sendlitEnv() {
    vi.stubEnv("SENDLIT_API_URL", "https://sendlit.test");
    vi.stubEnv("SENDLIT_PLATFORM_TEAM_API_KEY", "sl_live_platform");
    vi.stubEnv("SENDLIT_PLATFORM_REQUEST_TIMEOUT_MS", "5000");
}

function orgOption(
    available = true,
    fromEmail: string | null = "mail@example.com",
) {
    return {
        items: [
            {
                type: "organization" as const,
                name: "Org SMTP",
                fromName: "FrontLit",
                fromEmail,
                replyTo: null,
                isDefault: true,
                available,
                countsAgainstQuota: true as const,
            },
        ],
    };
}

function template(
    overrides: Partial<SendlitEmailTemplate> &
        Pick<SendlitEmailTemplate, "templateId" | "title">,
): SendlitEmailTemplate {
    const def = PLATFORM_TEMPLATES.find(
        (entry) => entry.title === overrides.title,
    );
    return {
        purpose: "transactional",
        content: def?.content ?? { style: {}, meta: {}, content: [] },
        createdAt: null,
        updatedAt: null,
        ...overrides,
    };
}

function canonicalTemplates(): SendlitEmailTemplate[] {
    return PLATFORM_TEMPLATES.map((definition, index) =>
        template({
            templateId: `tpl_${index + 1}`,
            title: definition.title,
        }),
    );
}

function readyHttp(templates = canonicalTemplates()) {
    http.sendingOptions.mockResolvedValue(orgOption());
    http.generalSettings.mockResolvedValue({ mailingAddress: "1 Main St" });
    http.listTemplates.mockResolvedValue(templates);
    http.sendEmail.mockResolvedValue({ txeId: "txe_1", status: "queued" });
}

describe("platform mail", () => {
    beforeEach(() => {
        resetPlatformMailStateForTests();
        resetCounters();
        for (const fn of Object.values(http)) fn.mockReset();
        sendlitEnv();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it("dumps the complete message to the console when no platform key is configured", async () => {
        vi.stubEnv("SENDLIT_PLATFORM_TEAM_API_KEY", "");
        const info = vi.spyOn(logger, "info").mockImplementation(() => {});

        await sendPlatformEmail(
            "otp",
            { otp: "654321" },
            {
                to: "ada@example.com",
                subject: "Your FrontLit verification code",
                idempotencyKey: "frontlit:otp:one",
            },
        );

        expect(http.sendEmail).not.toHaveBeenCalled();
        expect(info).toHaveBeenCalled();
        expect(getPlatformMailReadiness().state).toBe("ready");
    });

    it("uses escaped Liquid variables in every platform template", () => {
        const otp = JSON.stringify(
            PLATFORM_TEMPLATES.find((item) => item.key === "otp")?.content,
        );
        const invitation = JSON.stringify(
            PLATFORM_TEMPLATES.find((item) => item.key === "invitation")
                ?.content,
        );
        const ticketCreated = JSON.stringify(
            PLATFORM_TEMPLATES.find((item) => item.key === "ticket-created")
                ?.content,
        );
        expect(otp).toContain("{{ otp | escape }}");
        expect(invitation).toContain("{{ teamName | escape }}");
        expect(invitation).toContain("{{ inviterName | escape }}");
        expect(invitation).toContain("{{ acceptUrl | escape }}");
        expect(ticketCreated).toContain("{{ subject | escape }}");
        expect(ticketCreated).toContain("{{ ticketUrl | escape }}");
        expect(JSON.stringify(PLATFORM_TEMPLATES)).not.toContain("bodyHtml");
        expect(JSON.stringify(PLATFORM_TEMPLATES)).not.toMatch(
            /blockType":"footer"/,
        );
    });

    it("creates missing templates and caches their IDs without database state", async () => {
        const created: SendlitEmailTemplate[] = [];
        readyHttp([]);
        http.listTemplates.mockImplementation(async () => created.slice());
        http.createTemplate.mockImplementation(
            async (_apiKey: string, input: { title: string }) => {
                const row = template({
                    templateId: `tpl_${created.length + 1}`,
                    title: input.title,
                });
                created.push(row);
                return row;
            },
        );

        await ensurePlatformMailReady();
        expect(http.createTemplate).toHaveBeenCalledTimes(
            PLATFORM_TEMPLATES.length,
        );
        const listCalls = http.listTemplates.mock.calls.length;

        await sendPlatformEmail(
            "otp",
            { otp: "111111" },
            { to: "ada@example.com", subject: "code", idempotencyKey: "k1" },
        );
        expect(http.listTemplates).toHaveBeenCalledTimes(listCalls);
    });

    it("patches drifted template content and rejects cross-purpose title collisions", async () => {
        const templates = canonicalTemplates();
        const [otp] = templates;
        readyHttp([{ ...otp, content: {} }, ...templates.slice(1)]);
        http.updateTemplate.mockResolvedValue(otp);
        await ensurePlatformMailReady();
        expect(http.updateTemplate).toHaveBeenCalledWith(
            "sl_live_platform",
            otp.templateId,
            expect.objectContaining({ title: otp.title }),
            { timeoutMs: 5000 },
        );

        resetPlatformMailStateForTests();
        readyHttp([
            {
                ...otp,
                purpose: "marketing",
            },
        ]);
        await expect(ensurePlatformMailReady()).rejects.toThrow(
            /canonical_title_collision/,
        );
    });

    it("clears rejected initialization so a later attempt can recover", async () => {
        readyHttp();
        http.listTemplates.mockRejectedValueOnce(
            new SendlitApiError("SendLit API error 500", 500),
        );
        await expect(ensurePlatformMailReady()).rejects.toBeTruthy();
        expect(getPlatformMailReadiness().state).toBe("degraded");

        http.listTemplates.mockResolvedValue(canonicalTemplates());
        await expect(ensurePlatformMailReady()).resolves.toBeUndefined();
        expect(getPlatformMailReadiness().state).toBe("ready");
    });

    it("sends with the configured key, organization delivery, and stable retry key", async () => {
        readyHttp();
        await sendPlatformEmail(
            "otp",
            { otp: "111111" },
            {
                to: "ada@example.com",
                subject: "code",
                idempotencyKey: "frontlit:otp:stable",
            },
        );
        expect(http.sendEmail).toHaveBeenCalledWith(
            "sl_live_platform",
            expect.objectContaining({
                templateId: "tpl_1",
                deliverySource: { type: "organization" },
                idempotencyKey: "frontlit:otp:stable",
                variables: { otp: "111111" },
            }),
            { timeoutMs: 5000 },
        );

        http.sendEmail.mockReset();
        http.sendEmail.mockRejectedValue(
            new SendlitApiError("SendLit request timed out"),
        );
        await expect(
            sendPlatformEmail(
                "otp",
                { otp: "111111" },
                {
                    to: "ada@example.com",
                    subject: "code",
                    idempotencyKey: "frontlit:otp:stable",
                },
            ),
        ).rejects.toBeInstanceOf(MailDeliveryError);
        expect(http.sendEmail).toHaveBeenCalledTimes(2);
        expect(
            http.sendEmail.mock.calls.every(
                (call) => call[1].idempotencyKey === "frontlit:otp:stable",
            ),
        ).toBe(true);
    });

    it("repairs a missing template once and never exceeds three posts", async () => {
        readyHttp();
        http.sendEmail
            .mockRejectedValueOnce(
                new SendlitApiError(
                    "SendLit API error 400: Template not found",
                    400,
                    { errorCode: "Template not found" },
                ),
            )
            .mockRejectedValueOnce(
                new SendlitApiError("SendLit request timed out"),
            )
            .mockResolvedValueOnce({ txeId: "txe_2", status: "queued" });

        await sendPlatformEmail(
            "otp",
            { otp: "111111" },
            {
                to: "ada@example.com",
                subject: "code",
                idempotencyKey: "frontlit:otp:stable",
            },
        );
        expect(http.sendEmail).toHaveBeenCalledTimes(3);
    });

    it("marks static delivery failures as degraded", async () => {
        http.sendingOptions.mockResolvedValue(orgOption(false, null));
        http.generalSettings.mockResolvedValue({ mailingAddress: "1 Main St" });
        await expect(ensurePlatformMailReady()).rejects.toBeTruthy();
        expect(getPlatformMailReadiness().state).toBe("degraded");
        expect(getPlatformMailReadiness().lastError?.message).toBe(
            "organization_delivery_unavailable",
        );
    });

    it("logs the sanitized configuration reason while retrying initialization", async () => {
        const waits: number[] = [];
        const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
        setPlatformMailSleepForTests(
            async (ms) => {
                waits.push(ms);
            },
            () => 0,
        );
        http.sendingOptions
            .mockResolvedValueOnce(orgOption(false, null))
            .mockResolvedValue(orgOption());
        http.generalSettings.mockResolvedValue({ mailingAddress: "1 Main St" });
        http.listTemplates.mockResolvedValue(canonicalTemplates());

        startPlatformMailBackgroundInit();
        await vi.waitFor(() => {
            expect(getPlatformMailReadiness().state).toBe("ready");
        });
        expect(waits[0]).toBe(5000);
        expect(warn).toHaveBeenCalledWith(
            expect.objectContaining({
                errorType: "PlatformMailConfigError",
                reason: "organization_delivery_unavailable",
            }),
            "platform mail initialization failed",
        );
    });
});
