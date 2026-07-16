import { z } from "zod";

export const chatbotSettingsSchema = z.object({
    enabled: z.boolean(),
    name: z.string(),
    greeting: z.string().nullable().optional(),
    accentColor: z.string().nullable().optional(),
    /** Offer "talk to a human" (creates a help-desk ticket, §11.3) when the
     * bot can't answer. Independent of `enabled`. */
    escalationEnabled: z.boolean(),
    createdAt: z.string().nullable(),
    updatedAt: z.string().nullable(),
});

export const updateChatbotSettingsBodySchema = z.object({
    enabled: z.boolean().optional(),
    name: z.string().optional(),
    greeting: z.string().optional(),
    accentColor: z.string().optional(),
    escalationEnabled: z.boolean().optional(),
});

export const chatSourceSchema = z.object({
    documentId: z.string(),
    slug: z.string(),
    title: z.string().nullable(),
    anchor: z.string().nullable(),
});

/** What `apps/sites` needs to decide whether to mount the floating widget
 * and how to skin it (architecture.md §7.3) — never the escalation flag or
 * timestamps, which are dashboard-only concerns. */
export const publicChatbotSettingsSchema = z.object({
    enabled: z.boolean(),
    name: z.string(),
    greeting: z.string().nullable(),
    accentColor: z.string().nullable(),
});

export const chatRequestBodySchema = z.object({
    message: z.string().min(1),
    history: z
        .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
        .max(20)
        .optional(),
});

export const chatResponseSchema = z.object({
    answer: z.string(),
    sources: z.array(chatSourceSchema),
    /** True when the bot found no grounding sources — the widget offers
     * "talk to a human" (architecture.md §11.2) if the team's chatbot
     * settings have `escalationEnabled`. */
    escalate: z.boolean(),
});
