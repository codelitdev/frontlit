import { logger } from "../services/log";
import { incrementCounter } from "../services/metrics";
import {
    getPlatformMailConfig,
    type PlatformMailConfig,
} from "./platform-mail-config";
import {
    PLATFORM_TEMPLATES,
    type PlatformTemplateKey,
    type PlatformTemplateVariables,
} from "./platform-templates";
import {
    createSendlitEmailTemplate,
    getGeneralSettings,
    getSendlitSendingOptions,
    listSendlitEmailTemplates,
    sendEmail,
    SendlitApiError,
    updateSendlitEmailTemplate,
} from "./sendlit-client";

export type { PlatformTemplateKey, PlatformTemplateVariables };
export {
    invitationIdempotencyKey,
    newOtpIdempotencyKey,
    ticketIdempotencyKey,
} from "./platform-mail-keys";
export { PLATFORM_TEMPLATES } from "./platform-templates";
export {
    assertPlatformMailConfig,
    getPlatformMailConfig,
} from "./platform-mail-config";

export class MailDeliveryError extends Error {
    constructor(message = "mail_delivery_failed") {
        super(message);
        this.name = "MailDeliveryError";
    }
}

export class MailNotConfiguredError extends MailDeliveryError {
    constructor() {
        super("mail_not_configured");
        this.name = "MailNotConfiguredError";
    }
}

export class PlatformMailConfigError extends MailDeliveryError {
    constructor(message: string) {
        super(message);
        this.name = "PlatformMailConfigError";
    }
}

export type PlatformMailReadinessState = "ready" | "initializing" | "degraded";

export type PlatformMailReadiness = {
    state: PlatformMailReadinessState;
    lastError?: {
        message: string;
        httpStatus?: number;
        errorCode?: string;
        templateKey?: string;
    };
};

type SleepFn = (ms: number) => Promise<void>;

let templateIds: Record<PlatformTemplateKey, string> | null = null;
let templatesReady = false;
let initPromise: Promise<void> | null = null;
let syncPromise: Promise<Record<PlatformTemplateKey, string>> | null = null;
let sendlitState: PlatformMailReadinessState = "initializing";
let lastError: PlatformMailReadiness["lastError"];
let backgroundRunning = false;
let backgroundGeneration = 0;
let sleepFn: SleepFn = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms));
let randomFn = Math.random;

const MAX_POST_EMAILS = 3;

export function resetPlatformMailStateForTests(): void {
    templateIds = null;
    templatesReady = false;
    initPromise = null;
    syncPromise = null;
    sendlitState = "initializing";
    lastError = undefined;
    backgroundRunning = false;
    backgroundGeneration += 1;
    sleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    randomFn = Math.random;
}

export function setPlatformMailSleepForTests(
    sleep: SleepFn,
    random: () => number = () => 0,
): void {
    sleepFn = sleep;
    randomFn = random;
}

export function getPlatformMailReadiness(): PlatformMailReadiness {
    if (getPlatformMailConfig().mode === "console") {
        return { state: "ready" };
    }
    return lastError
        ? { state: sendlitState, lastError }
        : { state: sendlitState };
}

function config(): PlatformMailConfig {
    return getPlatformMailConfig();
}

function timeoutMs(): number {
    return config().requestTimeoutMs;
}

type SanitizedMailError = NonNullable<PlatformMailReadiness["lastError"]>;

function sanitizeError(
    error: unknown,
    templateKey?: PlatformTemplateKey,
): SanitizedMailError {
    if (error instanceof SendlitApiError) {
        return {
            message: error.message.slice(0, 200),
            httpStatus: error.status,
            errorCode: error.errorCode,
            templateKey,
        };
    }
    if (error instanceof MailNotConfiguredError) {
        return { message: "mail_not_configured", templateKey };
    }
    if (error instanceof PlatformMailConfigError) {
        return { message: error.message, templateKey };
    }
    if (error instanceof Error) {
        return { message: error.name || "error", templateKey };
    }
    return { message: "error", templateKey };
}

function recordFailure(
    metric: string,
    error: unknown,
    labels: Record<string, string> = {},
): void {
    const sanitized = sanitizeError(error);
    incrementCounter(metric, {
        ...labels,
        ...(sanitized.httpStatus
            ? { http_status: String(sanitized.httpStatus) }
            : {}),
        ...(sanitized.errorCode ? { error_code: sanitized.errorCode } : {}),
    });
}

function isAuthFailure(error: unknown): boolean {
    return (
        error instanceof SendlitApiError &&
        (error.status === 401 || error.status === 403)
    );
}

function handleTeamAuthFailure(error: unknown): void {
    if (!isAuthFailure(error)) return;
    sendlitState = "degraded";
    lastError = sanitizeError(error);
    templatesReady = false;
    templateIds = null;
    startPlatformMailBackgroundInit();
}

function invalidateTemplateCache(): void {
    templatesReady = false;
    templateIds = null;
    if (config().mode === "sendlit") {
        sendlitState = sendlitState === "ready" ? "initializing" : sendlitState;
        startPlatformMailBackgroundInit();
    }
}

function platformTeamApiKey(): string {
    const cfg = config();
    if (!cfg.platformTeamApiKey) throw new MailNotConfiguredError();
    return cfg.platformTeamApiKey;
}

function sameContent(
    left: Record<string, unknown>,
    right: Record<string, unknown>,
): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

async function reconcileTemplates(
    apiKey: string,
): Promise<Record<PlatformTemplateKey, string>> {
    let listed = await listSendlitEmailTemplates(apiKey, {
        timeoutMs: timeoutMs(),
    });
    const resolved = {} as Record<PlatformTemplateKey, string>;

    for (const def of PLATFORM_TEMPLATES) {
        const titled = listed.filter((item) => item.title === def.title);
        const otherPurpose = titled.find(
            (item) => item.purpose !== "transactional",
        );
        if (otherPurpose) {
            throw new PlatformMailConfigError("canonical_title_collision");
        }

        let winner = titled.find((item) => item.purpose === "transactional");
        if (!winner) {
            try {
                await createSendlitEmailTemplate(
                    apiKey,
                    {
                        title: def.title,
                        purpose: "transactional",
                        content: def.content,
                    },
                    { timeoutMs: timeoutMs() },
                );
            } catch {
                // Another replica may have created it; resolve by exact title.
            }
            listed = await listSendlitEmailTemplates(apiKey, {
                timeoutMs: timeoutMs(),
            });
            winner = listed.find(
                (item) =>
                    item.title === def.title &&
                    item.purpose === "transactional",
            );
            if (!winner) {
                throw new PlatformMailConfigError("template_sync_failed");
            }
        } else if (!sameContent(winner.content, def.content)) {
            await updateSendlitEmailTemplate(
                apiKey,
                winner.templateId,
                { title: def.title, content: def.content },
                { timeoutMs: timeoutMs() },
            );
        }

        resolved[def.key] = winner.templateId;
    }

    templateIds = resolved;
    templatesReady = true;
    return resolved;
}

export async function ensurePlatformTemplates(
    apiKey: string,
): Promise<Record<PlatformTemplateKey, string>> {
    if (templatesReady && templateIds) return templateIds;
    if (syncPromise) return syncPromise;
    syncPromise = (async () => {
        try {
            return await reconcileTemplates(apiKey);
        } catch (error) {
            templatesReady = false;
            templateIds = null;
            recordFailure("platform_mail_sync_failures_total", error);
            throw error;
        } finally {
            syncPromise = null;
        }
    })();
    return syncPromise;
}

async function preflight(apiKey: string): Promise<void> {
    const options = await getSendlitSendingOptions(apiKey, {
        timeoutMs: timeoutMs(),
    });
    const organization = options.items.find(
        (item) => item.type === "organization",
    );
    if (!organization || !organization.available || !organization.fromEmail) {
        throw new PlatformMailConfigError("organization_delivery_unavailable");
    }
    const settings = await getGeneralSettings(apiKey, {
        timeoutMs: timeoutMs(),
    });
    if (!settings.mailingAddress) {
        throw new PlatformMailConfigError("mailing_address_missing");
    }
    await ensurePlatformTemplates(apiKey);
}

function isInitialized(): boolean {
    return sendlitState === "ready" && templatesReady && templateIds !== null;
}

export async function ensurePlatformMailReady(): Promise<void> {
    if (config().mode === "console") {
        sendlitState = "ready";
        lastError = undefined;
        return;
    }
    if (isInitialized()) return;
    if (initPromise) return initPromise;
    initPromise = (async () => {
        try {
            await preflight(platformTeamApiKey());
            sendlitState = "ready";
            lastError = undefined;
        } catch (error) {
            handleTeamAuthFailure(error);
            if (!isAuthFailure(error)) {
                sendlitState = "degraded";
                lastError = sanitizeError(error);
            }
            recordFailure("platform_mail_preflight_failures_total", error);
            throw error;
        } finally {
            initPromise = null;
        }
    })();
    return initPromise;
}

export function startPlatformMailBackgroundInit(): void {
    if (config().mode !== "sendlit") return;
    if (backgroundRunning) return;
    backgroundRunning = true;
    const generation = backgroundGeneration;
    void (async () => {
        let delay = 5000;
        try {
            while (getPlatformMailReadiness().state !== "ready") {
                if (generation !== backgroundGeneration) return;
                try {
                    await ensurePlatformMailReady();
                } catch (error) {
                    if (generation !== backgroundGeneration) return;
                    const sanitized = sanitizeError(error);
                    logger.warn(
                        {
                            errorType:
                                error instanceof Error
                                    ? error.name
                                    : typeof error,
                            reason: sanitized.message,
                            ...(sanitized.httpStatus
                                ? { httpStatus: sanitized.httpStatus }
                                : {}),
                            ...(sanitized.errorCode
                                ? { sendlitErrorCode: sanitized.errorCode }
                                : {}),
                        },
                        "platform mail initialization failed",
                    );
                }
                if (generation !== backgroundGeneration) return;
                if (getPlatformMailReadiness().state === "ready") break;
                const wait = Math.min(
                    60_000,
                    delay + Math.floor(randomFn() * delay),
                );
                await sleepFn(wait);
                delay = Math.min(delay * 2, 60_000);
            }
        } finally {
            if (generation === backgroundGeneration) {
                backgroundRunning = false;
            }
        }
    })();
}

function isTransient(error: unknown): boolean {
    if (!(error instanceof SendlitApiError)) return false;
    if (!error.status) return true;
    return (
        error.status === 408 ||
        error.status === 502 ||
        error.status === 503 ||
        error.status === 504
    );
}

function isMissingTemplate(error: unknown): boolean {
    if (!(error instanceof SendlitApiError)) return false;
    if (error.status === 400 && error.errorCode === "Template not found") {
        return true;
    }
    return (
        error.status === 422 && error.errorCode === "template_not_transactional"
    );
}

function mapSendError(error: unknown): never {
    if (error instanceof MailNotConfiguredError) throw error;
    if (error instanceof MailDeliveryError) throw error;
    throw new MailDeliveryError();
}

export type SendPlatformEmailMeta = {
    to: string;
    subject: string;
    idempotencyKey: string;
    replyTo?: string;
    headers?: Record<string, string>;
};

export async function sendPlatformEmail<K extends PlatformTemplateKey>(
    templateKey: K,
    variables: PlatformTemplateVariables[K],
    meta: SendPlatformEmailMeta,
): Promise<void> {
    if (!meta.idempotencyKey || !meta.idempotencyKey.trim()) {
        throw new MailDeliveryError("idempotency_key_required");
    }

    const cfg = config();
    if (cfg.mode === "console") {
        logger.info(
            {
                templateKey,
                to: meta.to,
                subject: meta.subject,
                idempotencyKey: meta.idempotencyKey,
                variables,
                replyTo: meta.replyTo,
                headers: meta.headers,
            },
            "platform mail (console)",
        );
        return;
    }

    if (!cfg.apiUrl) throw new MailNotConfiguredError();

    try {
        await ensurePlatformMailReady();
    } catch (error) {
        if (error instanceof MailNotConfiguredError) throw error;
        mapSendError(error);
    }

    const apiKey = platformTeamApiKey();
    if (!templateIds) {
        throw new MailDeliveryError();
    }

    let transportRetried = false;
    let repaired = false;
    let posts = 0;
    let last: unknown;

    while (posts < MAX_POST_EMAILS) {
        try {
            posts += 1;
            await sendEmail(
                apiKey,
                {
                    to: meta.to,
                    subject: meta.subject,
                    templateId: templateIds[templateKey],
                    variables,
                    deliverySource: { type: "organization" },
                    idempotencyKey: meta.idempotencyKey,
                    ...(meta.replyTo ? { replyTo: meta.replyTo } : {}),
                    ...(meta.headers ? { headers: meta.headers } : {}),
                },
                { timeoutMs: timeoutMs() },
            );
            incrementCounter("platform_mail_sends_total", {
                template_key: templateKey,
                result: "ok",
                retry_count: String(posts - 1),
            });
            return;
        } catch (error) {
            last = error;
            handleTeamAuthFailure(error);
            if (isAuthFailure(error)) break;
            if (isMissingTemplate(error) && !repaired) {
                repaired = true;
                invalidateTemplateCache();
                try {
                    await ensurePlatformMailReady();
                } catch (repairError) {
                    last = repairError;
                    break;
                }
                continue;
            }
            if (isTransient(error) && !transportRetried) {
                transportRetried = true;
                continue;
            }
            break;
        }
    }

    recordFailure("platform_mail_sends_total", last, {
        template_key: templateKey,
        result: "error",
        retry_count: String(Math.max(0, posts - 1)),
    });
    mapSendError(last);
}
