import { z } from "zod";

// ---- Public lead capture (architecture.md §10.2) ---------------------------

export const captureLeadBodySchema = z.object({
    email: z.string().email(),
    sourcePageId: z.string().optional(),
    sourcePath: z.string().optional(),
    /** Honeypot field: real users never fill this in (hidden via CSS on the
     * public form) \u2014 a non-empty value is a strong bot signal, rejected
     * silently with a 200 so bots can't tell they were caught. */
    website: z.string().optional(),
    /** Cloudflare Turnstile response token (architecture.md \u00a713.3). Omit
     * entirely when the deployment runs honeypot-only (`CAPTCHA_PROVIDER=none`). */
    turnstileToken: z.string().optional(),
});

export const captureLeadResponseSchema = z.object({ accepted: z.boolean() });

// ---- Contacts (read-through proxy to SendLit) ------------------------------

export const contactSchema = z.object({
    contactId: z.string(),
    email: z.string(),
    name: z.string().nullable().optional(),
    tags: z.array(z.string()),
    subscribed: z.boolean(),
    createdAt: z.string().optional(),
});

export const listContactsQuerySchema = z.object({
    email: z.string().optional(),
    tag: z.string().optional(),
    subscribed: z.coerce.boolean().optional(),
    offset: z.coerce.number().int().min(1).optional(),
    itemsPerPage: z.coerce.number().int().min(1).optional(),
});

// ---- Segments (proxy to SendLit) -------------------------------------------

export const segmentSchema = z.object({
    segmentId: z.string(),
    name: z.string(),
    conditions: z.array(z.record(z.any())),
});

export const createSegmentBodySchema = z.object({
    name: z.string().min(1),
    conditions: z.array(z.record(z.any())).default([]),
});

export const updateSegmentBodySchema = z.object({
    name: z.string().optional(),
    conditions: z.array(z.record(z.any())).optional(),
});

// ---- Newsletter settings + broadcasts (proxy to SendLit) -------------------

export const newsletterSettingsSchema = z.object({
    connected: z.boolean(),
    fromName: z.string().nullable().optional(),
    fromEmail: z.string().nullable().optional(),
    replyTo: z.string().nullable().optional(),
});

export const updateNewsletterSettingsBodySchema = z.object({
    fromName: z.string().optional(),
    fromEmail: z.string().optional(),
    replyTo: z.string().optional(),
});

export const broadcastSchema = z.object({
    broadcastId: z.string(),
    name: z.string(),
    status: z.string(),
    subject: z.string().nullable().optional(),
    body: z.record(z.any()).nullable().optional(),
    createdAt: z.string().nullable().optional(),
});

export const createBroadcastBodySchema = z.object({
    name: z.string().min(1),
    subject: z.string().optional(),
    body: z.record(z.any()).optional(),
});

export const updateBroadcastBodySchema = z.object({
    name: z.string().optional(),
    subject: z.string().optional(),
    body: z.record(z.any()).optional(),
});
