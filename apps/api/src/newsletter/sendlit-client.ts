/**
 * FrontLit's SendLit client (architecture.md §10.1). SendLit is a separate
 * product/repo — its `@sendlit/api-contract` package isn't published to a
 * registry FrontLit can install from, so this is a small hand-written
 * `fetch` client matching SendLit's real REST surface (`sendlit/packages/
 * api-contract/src/contract.ts`) rather than an `initClient(...)` over the
 * shared contract package. Every shape below mirrors that contract exactly;
 * if SendLit's contract changes, update here.
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
    options: { method?: string; apiKey?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
    const res = await fetch(baseUrl() + path, {
        method: options.method ?? "GET",
        headers: {
            "content-type": "application/json",
            ...(options.apiKey ? { "x-sendlit-apikey": options.apiKey } : {}),
            ...options.headers,
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new SendlitApiError(`SendLit API error ${res.status}: ${text.slice(0, 300)}`, res.status);
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
}

// ---- Provisioning ----------------------------------------------------------

export type ProvisionTeamResult = { teamId: string; name: string; apiKey?: string };

/** `POST /provisioning/teams` \u2014 idempotent find-or-create by `externalId`,
 * exactly mirroring FrontLit's own provisioning endpoint. Requires the
 * shared `SENDLIT_PROVISIONING_SECRET`, not a per-team API key. */
export async function provisionSendlitTeam(input: { externalId: string; ownerEmail: string; name: string }): Promise<ProvisionTeamResult> {
    const secret = process.env.SENDLIT_PROVISIONING_SECRET;
    if (!secret) throw new SendlitApiError("SENDLIT_PROVISIONING_SECRET is not configured");

    return request<ProvisionTeamResult>("/provisioning/teams", {
        method: "POST",
        body: input,
        headers: { "x-sendlit-provisioning-secret": secret },
    });
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

export async function upsertContact(apiKey: string, input: { email: string; name?: string }) {
    return request<SendlitContact>("/contacts", { method: "POST", apiKey, body: input });
}

export async function addContactTag(apiKey: string, contactId: string, tag: string) {
    return request<SendlitContact>(`/contacts/${contactId}/tags/${encodeURIComponent(tag)}`, { method: "POST", apiKey });
}

export async function removeContactTag(apiKey: string, contactId: string, tag: string) {
    return request<SendlitContact>(`/contacts/${contactId}/tags/${encodeURIComponent(tag)}`, { method: "DELETE", apiKey });
}

export async function listContacts(apiKey: string, query: Record<string, string | number | undefined> = {}) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) params.set(key, String(value));
    }
    const qs = params.toString();
    return request<{ items: SendlitContact[]; total: number }>(`/contacts${qs ? `?${qs}` : ""}`, { apiKey });
}

export async function getContact(apiKey: string, contactId: string) {
    return request<SendlitContact>(`/contacts/${contactId}`, { apiKey });
}

export async function deleteContact(apiKey: string, contactId: string) {
    return request<void>(`/contacts/${contactId}`, { method: "DELETE", apiKey });
}

// ---- Segments ---------------------------------------------------------------

export type SendlitSegment = { segmentId: string; name: string; conditions: Record<string, unknown>[] };

export async function listSegments(apiKey: string) {
    return request<{ items: SendlitSegment[] }>("/segments", { apiKey });
}

export async function createSegment(apiKey: string, input: { name: string; conditions: Record<string, unknown>[] }) {
    return request<SendlitSegment>("/segments", { method: "POST", apiKey, body: input });
}

export async function updateSegment(apiKey: string, segmentId: string, patch: Partial<{ name: string; conditions: Record<string, unknown>[] }>) {
    return request<SendlitSegment>(`/segments/${segmentId}`, { method: "PATCH", apiKey, body: patch });
}

export async function deleteSegment(apiKey: string, segmentId: string) {
    return request<void>(`/segments/${segmentId}`, { method: "DELETE", apiKey });
}

// ---- Settings (newsletter "from" identity) ----------------------------------

export type SendlitGeneralSettings = { fromName?: string; fromEmail?: string; replyTo?: string };

export async function getGeneralSettings(apiKey: string) {
    return request<SendlitGeneralSettings>("/settings/general", { apiKey });
}

export async function updateGeneralSettings(apiKey: string, patch: Partial<SendlitGeneralSettings>) {
    return request<SendlitGeneralSettings>("/settings/general", { method: "PUT", apiKey, body: patch });
}

// ---- Broadcasts (SendLit models these as "sequences") -----------------------

export type SendlitSequence = {
    sequenceId: string;
    name: string;
    status: string;
    subject?: string;
    body?: Record<string, unknown>;
    createdAt?: string;
};

export async function listBroadcasts(apiKey: string) {
    // SendLit's `GET /sequences` serves both broadcasts and drip sequences
    // and requires `type` to disambiguate — FrontLit's newsletter only ever
    // deals in one-off broadcasts (architecture.md §10.3).
    return request<{ items: SendlitSequence[] }>("/sequences?type=broadcast", { apiKey });
}

export async function createBroadcast(apiKey: string, input: { name: string; subject?: string; body?: Record<string, unknown> }) {
    return request<SendlitSequence>("/sequences", { method: "POST", apiKey, body: input });
}

export async function updateBroadcast(apiKey: string, sequenceId: string, patch: Partial<{ name: string; subject: string; body: Record<string, unknown> }>) {
    return request<SendlitSequence>(`/sequences/${sequenceId}`, { method: "PATCH", apiKey, body: patch });
}

export async function sendBroadcast(apiKey: string, sequenceId: string) {
    return request<{ status: string }>(`/sequences/${sequenceId}/start`, { method: "POST", apiKey });
}

export async function getBroadcastStats(apiKey: string, sequenceId: string) {
    return request<Record<string, unknown>>(`/sequences/${sequenceId}/stats`, { apiKey });
}

// ---- Transactional email (help-desk ticket notifications, §11.2) -----------

export type SendlitTransactionalEmail = { txeId: string; status: string };

/** `POST /emails` — single API-triggered send, used for help-desk ticket
 * notifications (agent replies to the requester, new requester messages to
 * the team). Fire-and-forget from the caller's perspective (202 = queued). */
export async function sendEmail(apiKey: string, input: { to: string; subject: string; html: string; replyTo?: string }) {
    return request<SendlitTransactionalEmail>("/emails", { method: "POST", apiKey, body: input });
}
