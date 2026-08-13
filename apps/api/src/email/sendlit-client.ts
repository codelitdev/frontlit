/**
 * FrontLit's SendLit client (architecture.md §10.1). SendLit is a separate
 * product/repo — its `@sendlit/api-contract` package isn't published to a
 * registry FrontLit can install from, so this is a small hand-written
 * `fetch` client matching SendLit's real REST surface (`sendlit/packages/
 * api-contract/src/contract.ts`) rather than an `initClient(...)` over the
 * shared contract package. If SendLit's contract changes, update this
 * adapter and its contract-level tests together.
 *
 * FrontLit talks to SendLit exclusively over this hosted REST API — no
 * shared DB, no imported server code. `SENDLIT_API_URL` points at either the
 * hosted instance or a self-hosted one running next to FrontLit (§10.4);
 * the integration is identical either way.
 */

export class SendlitApiError extends Error {
    constructor(
        message: string,
        public status?: number,
    ) {
        super(message);
    }
}

function baseUrl(): string {
    const url = process.env.SENDLIT_API_URL;
    if (!url) throw new SendlitApiError("SENDLIT_API_URL is not configured");
    return url.replace(/\/$/, "");
}

async function request<T>(
    path: string,
    options: {
        method?: string;
        apiKey?: string;
        body?: unknown;
        headers?: Record<string, string>;
    } = {},
): Promise<T> {
    const res = await fetch(baseUrl() + path, {
        method: options.method ?? "GET",
        headers: {
            "content-type": "application/json",
            ...(options.apiKey ? { "x-sendlit-apikey": options.apiKey } : {}),
            ...options.headers,
        },
        body:
            options.body !== undefined
                ? JSON.stringify(options.body)
                : undefined,
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new SendlitApiError(
            `SendLit API error ${res.status}: ${text.slice(0, 300)}`,
            res.status,
        );
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
}

// ---- Provisioning ----------------------------------------------------------

export type ProvisionTeamResult = {
    teamId: string;
    name: string;
    apiKey: string | null;
};

/** `POST /provisioning/teams` \u2014 idempotent find-or-create by `externalId`.
 * SendLit scopes this endpoint to an organization API key, so a FrontLit
 * deployment can provision teams only within its dedicated SendLit org. */
export async function provisionSendlitTeam(input: {
    externalId: string;
    name: string;
}): Promise<ProvisionTeamResult> {
    const organizationApiKey = process.env.SENDLIT_ORGANIZATION_API_KEY;
    if (!organizationApiKey)
        throw new SendlitApiError(
            "SENDLIT_ORGANIZATION_API_KEY is not configured",
        );

    return request<ProvisionTeamResult>("/provisioning/teams", {
        method: "POST",
        body: input,
        headers: { authorization: `Bearer ${organizationApiKey}` },
    });
}

/** Creates a replacement team-scoped key when a prior idempotent
 * provisioning request created the team but FrontLit never persisted its
 * one-time key response. SendLit revokes the previous organization-created
 * key as part of this operation. */
export async function createSendlitTeamKey(teamId: string): Promise<string> {
    const organizationApiKey = process.env.SENDLIT_ORGANIZATION_API_KEY;
    if (!organizationApiKey)
        throw new SendlitApiError(
            "SENDLIT_ORGANIZATION_API_KEY is not configured",
        );

    const result = await request<{ key: string }>(
        `/provisioning/teams/${encodeURIComponent(teamId)}/keys`,
        {
            method: "POST",
            body: { name: "FrontLit integration" },
            headers: { authorization: `Bearer ${organizationApiKey}` },
        },
    );
    return result.key;
}

// ---- Contacts (read-through + sync) ----------------------------------------

export type SendlitContact = {
    contactId: string;
    email: string;
    name?: string | null;
    tags: string[];
    subscribed: boolean;
    createdAt?: string;
};

export async function upsertContact(
    apiKey: string,
    input: { email: string; name?: string; tags?: string[] },
) {
    return request<SendlitContact>("/contacts", {
        method: "POST",
        apiKey,
        body: input,
    });
}

export async function addContactTag(
    apiKey: string,
    contactId: string,
    tag: string,
) {
    return request<SendlitContact>(
        `/contacts/${contactId}/tags/${encodeURIComponent(tag)}`,
        { method: "POST", apiKey },
    );
}

export async function removeContactTag(
    apiKey: string,
    contactId: string,
    tag: string,
) {
    return request<SendlitContact>(
        `/contacts/${contactId}/tags/${encodeURIComponent(tag)}`,
        { method: "DELETE", apiKey },
    );
}

export async function listContacts(
    apiKey: string,
    query: Record<string, string | number | boolean | undefined> = {},
) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        if (value === undefined) continue;
        // SendLit's contacts list paginates with `rowsPerPage`.
        params.set(key === "itemsPerPage" ? "rowsPerPage" : key, String(value));
    }
    const qs = params.toString();
    return request<{ items: SendlitContact[]; total: number }>(
        `/contacts${qs ? `?${qs}` : ""}`,
        { apiKey },
    );
}

export async function getContact(apiKey: string, contactId: string) {
    return request<SendlitContact>(`/contacts/${contactId}`, { apiKey });
}

export async function deleteContact(apiKey: string, contactId: string) {
    return request<void>(`/contacts/${contactId}`, {
        method: "DELETE",
        apiKey,
    });
}

// ---- Segments ---------------------------------------------------------------

export type SendlitContactFilter = {
    aggregator: "and" | "or";
    filters: Array<{
        name: string;
        condition: string;
        value?: string;
        key?: string;
        valueLabel?: string;
    }>;
};

export const EMPTY_CONTACT_FILTER: SendlitContactFilter = {
    aggregator: "and",
    filters: [],
};

export type SendlitSegment = {
    segmentId: string;
    name: string;
    filter: SendlitContactFilter;
};

function toSendlitSegment(raw: {
    segmentId: string;
    name: string;
    filter?: SendlitContactFilter | null;
    conditions?: SendlitContactFilter["filters"];
}): SendlitSegment {
    return {
        segmentId: raw.segmentId,
        name: raw.name,
        filter: raw.filter ?? {
            aggregator: "and",
            filters: raw.conditions ?? [],
        },
    };
}

export async function listSegments(apiKey: string) {
    const result = await request<
        | Parameters<typeof toSendlitSegment>[0][]
        | { items: Parameters<typeof toSendlitSegment>[0][] }
    >("/segments", { apiKey });
    const items = Array.isArray(result) ? result : (result.items ?? []);
    return { items: items.map(toSendlitSegment) };
}

export async function createSegment(
    apiKey: string,
    input: { name: string; filter: SendlitContactFilter },
) {
    return toSendlitSegment(
        await request<Parameters<typeof toSendlitSegment>[0]>("/segments", {
            method: "POST",
            apiKey,
            body: input,
        }),
    );
}

export async function updateSegment(
    apiKey: string,
    segmentId: string,
    patch: Partial<{ name: string; filter: SendlitContactFilter }>,
) {
    return toSendlitSegment(
        await request<Parameters<typeof toSendlitSegment>[0]>(
            `/segments/${segmentId}`,
            {
                method: "PATCH",
                apiKey,
                body: patch,
            },
        ),
    );
}

export async function deleteSegment(apiKey: string, segmentId: string) {
    return request<void>(`/segments/${segmentId}`, {
        method: "DELETE",
        apiKey,
    });
}

// ---- General settings (email compliance) -------------------------------

export type SendlitGeneralSettings = {
    mailingAddress: string | null;
    updatedAt?: string | null;
};

export async function getGeneralSettings(apiKey: string) {
    return request<SendlitGeneralSettings>("/settings/general", { apiKey });
}

export async function updateGeneralSettings(
    apiKey: string,
    patch: Partial<SendlitGeneralSettings>,
) {
    return request<SendlitGeneralSettings>("/settings/general", {
        method: "PUT",
        apiKey,
        body: patch,
    });
}

// ---- ESP (default email delivery provider) ---------------------------------

export type SendlitEspProvider =
    "smtp" | "sendgrid" | "mailgun" | "postmark" | "ses" | "resend" | "custom";

export type SendlitEspConfig = {
    espId: string;
    name: string;
    isDefault: boolean;
    provider: string;
    host: string;
    port: number;
    secure: boolean;
    username?: string | null;
    hasPassword: boolean;
    fromName?: string | null;
    fromEmail?: string | null;
    lastTestedAt?: string | null;
    lastTestStatus?: "success" | "failed" | null;
    lastTestError?: string | null;
    updatedAt?: string | null;
    status?: "draft" | "active" | "suspended" | "draining" | "retired";
};

type SendlitEspRecord = Omit<SendlitEspConfig, "isDefault" | "status"> & {
    status: NonNullable<SendlitEspConfig["status"]>;
};

type SendlitDeliverySettings = {
    defaultSource: "organization" | "team" | null;
    defaultTeamEspId: string | null;
};

export type SendlitEspInput = {
    provider: SendlitEspProvider;
    host: string;
    port: number;
    secure: boolean;
    username?: string;
    password?: string;
    fromName?: string;
    fromEmail?: string;
};

export async function getEspConfig(apiKey: string) {
    const [{ items }, delivery] = await Promise.all([
        request<{ items: SendlitEspRecord[] }>("/settings/esps", { apiKey }),
        request<SendlitDeliverySettings>("/settings/delivery", { apiKey }),
    ]);
    const available = items.filter((item) => item.status !== "retired");
    const config =
        available.find((item) => item.espId === delivery.defaultTeamEspId) ??
        available[0];
    if (!config) return null;
    return {
        ...config,
        isDefault:
            delivery.defaultSource === "team" &&
            delivery.defaultTeamEspId === config.espId,
    } satisfies SendlitEspConfig;
}

export async function upsertEspConfig(apiKey: string, input: SendlitEspInput) {
    const existing = await getEspConfig(apiKey);
    if (existing) {
        const updated = await request<SendlitEspRecord>(
            `/settings/esps/${encodeURIComponent(existing.espId)}`,
            { method: "PATCH", apiKey, body: input },
        );
        return { ...updated, isDefault: existing.isDefault };
    }

    const created = await request<SendlitEspRecord>("/settings/esps", {
        method: "POST",
        apiKey,
        body: { name: "FrontLit Default", ...input },
    });
    return { ...created, isDefault: false };
}

export async function deleteEspConfig(apiKey: string) {
    const config = await getEspConfig(apiKey);
    if (!config) return;
    const path = `/settings/esps/${encodeURIComponent(config.espId)}`;
    if (
        config.status === "active" ||
        config.status === "suspended" ||
        config.status === "draining"
    ) {
        await request(path + "/retire", {
            method: "POST",
            apiKey,
            body: { transition: "cancel" },
        });
        return;
    }
    await request<void>(path, { method: "DELETE", apiKey });
}

export async function testEspConfig(apiKey: string, to: string) {
    const config = await getEspConfig(apiKey);
    if (!config) throw new SendlitApiError("SendLit ESP is not configured");
    const path = `/settings/esps/${encodeURIComponent(config.espId)}`;
    const result = await request<{ success: boolean; error?: string }>(
        path + "/test",
        {
            method: "POST",
            apiKey,
            body: { to },
        },
    );
    if (result.success && config.status === "draft") {
        await request<SendlitEspRecord>(path + "/activate", {
            method: "POST",
            apiKey,
        });
    }
    if (
        result.success &&
        (config.status === "draft" || config.status === "active") &&
        !config.isDefault
    ) {
        await request<SendlitDeliverySettings>("/settings/delivery", {
            method: "PATCH",
            apiKey,
            body: { deliverySource: { type: "team", espId: config.espId } },
        });
    }
    return result;
}

// ---- Broadcasts (SendLit models these as "sequences") -----------------------

export type SendlitSequenceEmail = {
    emailId: string;
    subject: string;
    content: Record<string, unknown>;
    delayInMillis: number;
    published: boolean;
    createdAt?: string | null;
    updatedAt?: string | null;
};

export type SendlitSequence = {
    sequenceId: string;
    type: string;
    title: string;
    status: string;
    emails: SendlitSequenceEmail[];
    filter?: SendlitContactFilter | null;
    createdAt?: string | null;
    updatedAt?: string | null;
};

export type FrontlitBroadcast = {
    broadcastId: string;
    name: string;
    status: string;
    subject?: string;
    body?: Record<string, unknown>;
    filter?: SendlitContactFilter | null;
    createdAt?: string | null;
    updatedAt?: string | null;
};

export type FrontlitEmailTemplate = {
    templateId: string;
    title: string;
    body: Record<string, unknown>;
    createdAt?: string | null;
    updatedAt?: string | null;
};

type SendlitEmailTemplate = {
    templateId: string;
    title: string;
    content: Record<string, unknown>;
    createdAt?: string | null;
    updatedAt?: string | null;
};

/** SendLit's stable built-in marketing starter. It is intentionally a system
 * template: every provisioned team can create its first broadcast without
 * FrontLit having to maintain a duplicate template in SendLit. */
const DEFAULT_BROADCAST_TEMPLATE_ID = "system:blank";

function toEmailTemplate(
    template: SendlitEmailTemplate,
): FrontlitEmailTemplate {
    return {
        templateId: template.templateId,
        title: template.title,
        body: template.content,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
    };
}

export async function listEmailTemplates(apiKey: string) {
    const templates = await request<SendlitEmailTemplate[]>(
        "/templates?purpose=marketing",
        { apiKey },
    );
    return templates.map(toEmailTemplate);
}

export type FrontlitSystemEmailTemplate = {
    templateId: string;
    title: string;
    description?: string;
    body: Record<string, unknown>;
};

type SendlitSystemEmailTemplate = {
    templateId: string;
    title: string;
    description?: string;
    content: Record<string, unknown>;
};

export async function listSystemEmailTemplates(apiKey: string) {
    const result = await request<
        SendlitSystemEmailTemplate[] | { items: SendlitSystemEmailTemplate[] }
    >("/system-templates?purpose=marketing", { apiKey });
    const items = Array.isArray(result) ? result : (result.items ?? []);
    return items.map((template) => ({
        templateId: template.templateId,
        title: template.title,
        description: template.description,
        body: template.content,
    }));
}

export async function createEmailTemplate(
    apiKey: string,
    input: { title: string; body: Record<string, unknown> },
) {
    return toEmailTemplate(
        await request<SendlitEmailTemplate>("/templates", {
            method: "POST",
            apiKey,
            body: {
                title: input.title,
                purpose: "marketing",
                content: input.body,
            },
        }),
    );
}

export async function updateEmailTemplate(
    apiKey: string,
    templateId: string,
    patch: Partial<{ title: string; body: Record<string, unknown> }>,
) {
    return toEmailTemplate(
        await request<SendlitEmailTemplate>(
            `/templates/${encodeURIComponent(templateId)}`,
            {
                method: "PATCH",
                apiKey,
                body: {
                    ...(patch.title === undefined
                        ? {}
                        : { title: patch.title }),
                    ...(patch.body === undefined
                        ? {}
                        : { content: patch.body }),
                },
            },
        ),
    );
}

function firstEmail(sequence: SendlitSequence): SendlitSequenceEmail {
    const email = sequence.emails[0];
    if (!email) {
        throw new SendlitApiError(
            "SendLit created a broadcast without an email draft",
        );
    }
    return email;
}

/** Maps SendLit's sequence-plus-first-email model to FrontLit's one-off
 * broadcast representation. */
export function toBroadcast(sequence: SendlitSequence): FrontlitBroadcast {
    const email = sequence.emails[0];
    return {
        broadcastId: sequence.sequenceId,
        name: sequence.title,
        status: sequence.status,
        subject: email?.subject,
        body: email?.content,
        filter: sequence.filter ?? EMPTY_CONTACT_FILTER,
        createdAt: sequence.createdAt,
        updatedAt: sequence.updatedAt,
    };
}

export async function listBroadcasts(apiKey: string) {
    // SendLit's `GET /sequences` serves both broadcasts and drip sequences
    // and requires `type` to disambiguate — FrontLit's email feature only ever
    // deals in one-off broadcasts (architecture.md §10.3).
    return request<{ items: SendlitSequence[] }>("/sequences?type=broadcast", {
        apiKey,
    });
}

export async function createBroadcast(
    apiKey: string,
    input: {
        name: string;
        subject?: string;
        body?: Record<string, unknown>;
        templateId?: string;
        filter?: SendlitContactFilter;
    },
) {
    // SendLit requires a marketing starter to create a sequence. Its initial
    // title and subject come from that starter, so set FrontLit's title and
    // the email draft explicitly afterwards.
    let sequence = await request<SendlitSequence>("/sequences", {
        method: "POST",
        apiKey,
        body: {
            type: "broadcast",
            templateId: input.templateId ?? DEFAULT_BROADCAST_TEMPLATE_ID,
        },
    });
    sequence = await request<SendlitSequence>(
        `/sequences/${sequence.sequenceId}`,
        {
            method: "PATCH",
            apiKey,
            body: {
                title: input.name,
                ...(input.filter === undefined ? {} : { filter: input.filter }),
            },
        },
    );

    const email = firstEmail(sequence);
    return request<SendlitSequence>(
        `/sequences/${sequence.sequenceId}/emails/${email.emailId}`,
        {
            method: "PATCH",
            apiKey,
            body: {
                // A newly-created draft should never retain the starter's
                // "Blank" subject. The name is a sensible default until an
                // editor provides a distinct subject.
                subject: input.subject ?? input.name,
                ...(input.body === undefined ? {} : { content: input.body }),
            },
        },
    );
}

export async function updateBroadcast(
    apiKey: string,
    sequenceId: string,
    patch: Partial<{
        name: string;
        subject: string;
        body: Record<string, unknown>;
        filter: SendlitContactFilter | null;
    }>,
) {
    // Title lives on the sequence, while subject/content live on its sole
    // email. Read first so the correct public email id is always used.
    let sequence = await request<SendlitSequence>(`/sequences/${sequenceId}`, {
        apiKey,
    });

    if (patch.subject !== undefined || patch.body !== undefined) {
        const email = firstEmail(sequence);
        sequence = await request<SendlitSequence>(
            `/sequences/${sequenceId}/emails/${email.emailId}`,
            {
                method: "PATCH",
                apiKey,
                body: {
                    ...(patch.subject === undefined
                        ? {}
                        : { subject: patch.subject }),
                    ...(patch.body === undefined
                        ? {}
                        : { content: patch.body }),
                },
            },
        );
    }

    // Audience lives on the sequence. Apply it last — SendLit's email
    // PATCH response can omit or reset `filter`.
    if (patch.name !== undefined || patch.filter !== undefined) {
        sequence = await request<SendlitSequence>(`/sequences/${sequenceId}`, {
            method: "PATCH",
            apiKey,
            body: {
                ...(patch.name === undefined ? {} : { title: patch.name }),
                ...(patch.filter === undefined ? {} : { filter: patch.filter }),
            },
        });
    }

    return sequence;
}

export async function sendBroadcast(apiKey: string, sequenceId: string) {
    return request<{ status: string }>(`/sequences/${sequenceId}/start`, {
        method: "POST",
        apiKey,
    });
}

export async function deleteBroadcast(apiKey: string, sequenceId: string) {
    return request<void>(`/sequences/${sequenceId}`, {
        method: "DELETE",
        apiKey,
    });
}

export async function getBroadcastStats(apiKey: string, sequenceId: string) {
    return request<Record<string, unknown>>(`/sequences/${sequenceId}/stats`, {
        apiKey,
    });
}

// ---- Transactional email (help-desk ticket notifications, §11.2) -----------

export type SendlitTransactionalEmail = { txeId: string; status: string };

/** `POST /emails` — single API-triggered send, used for help-desk ticket
 * notifications (agent replies to the requester, new requester messages to
 * the team). Fire-and-forget from the caller's perspective (202 = queued). */
export async function sendEmail(
    apiKey: string,
    input: { to: string; subject: string; html: string; replyTo?: string },
) {
    return request<SendlitTransactionalEmail>("/emails", {
        method: "POST",
        apiKey,
        body: input,
    });
}
