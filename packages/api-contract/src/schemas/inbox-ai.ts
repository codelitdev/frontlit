import { z } from "zod";

export const inboxAiChannelSchema = z.enum(["chatbot", "tickets"]);
export type InboxAiChannel = z.infer<typeof inboxAiChannelSchema>;

export const inboxAiPolicySchema = z.object({
    channel: inboxAiChannelSchema,
    autoReply: z.boolean(),
    escalateOnVisitorRequest: z.boolean(),
    escalateWhenUnsure: z.boolean(),
    escalateTopics: z.array(z.string()),
    escalateAfterBotTurns: z.number().int().nullable(),
    createdAt: z.string().nullable(),
    updatedAt: z.string().nullable(),
});

export const inboxAiPolicyPatchSchema = z.object({
    autoReply: z.boolean().optional(),
    escalateOnVisitorRequest: z.boolean().optional(),
    escalateWhenUnsure: z.boolean().optional(),
    escalateTopics: z.array(z.string()).optional(),
    escalateAfterBotTurns: z.number().int().nullable().optional(),
});

export const inboxAiSettingsSchema = z.object({
    aiConfigured: z.boolean(),
    channels: z.object({
        chatbot: inboxAiPolicySchema.optional(),
        tickets: inboxAiPolicySchema.optional(),
    }),
});

export const updateInboxAiSettingsBodySchema = z.object({
    channels: z
        .object({
            chatbot: inboxAiPolicyPatchSchema.optional(),
            tickets: inboxAiPolicyPatchSchema.optional(),
        })
        .refine(
            (value) =>
                value.chatbot !== undefined || value.tickets !== undefined,
            { message: "At least one channel is required" },
        ),
});
