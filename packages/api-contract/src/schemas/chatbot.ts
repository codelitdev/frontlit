import { z } from "zod";

/** Floating launcher style on the public site (architecture.md §7.3). */
export const chatbotWidgetVariantSchema = z.enum(["bubble", "text_input"]);
export type ChatbotWidgetVariant = z.infer<typeof chatbotWidgetVariantSchema>;

/**
 * Visual knobs for the public launcher. Bubble fields apply when
 * `variant === "bubble"`; input fields when `variant === "text_input"`.
 * All keys are optional on write; reads always return a fully-defaulted object.
 */
export const chatbotWidgetStyleSchema = z.object({
  /** Bubble launcher shape. */
  bubbleShape: z.enum(["circle", "rounded", "square"]).default("circle"),
  /** Icon drawn inside the bubble. */
  bubbleIcon: z.enum(["chat", "message", "sparkles", "bot"]).default("chat"),
  /** Bubble diameter. */
  bubbleSize: z.enum(["sm", "md", "lg"]).default("md"),
  /** Corner radius of the text-input launcher. */
  inputRadius: z.enum(["none", "sm", "md", "lg", "full"]).default("full"),
  /** Placeholder shown in the text-input launcher. */
  inputPlaceholder: z.string().max(80).nullable().optional().default(null),
  /** Width of the text-input launcher. */
  inputWidth: z.enum(["sm", "md", "lg"]).default("md"),
});
export type ChatbotWidgetStyle = z.infer<typeof chatbotWidgetStyleSchema>;

export const DEFAULT_CHATBOT_WIDGET_STYLE: ChatbotWidgetStyle =
  chatbotWidgetStyleSchema.parse({});

/** Partial style patch accepted on update — missing keys keep previous values. */
export const chatbotWidgetStylePatchSchema = chatbotWidgetStyleSchema.partial();

export const chatbotSettingsSchema = z.object({
  enabled: z.boolean(),
  name: z.string(),
  greeting: z.string().nullable().optional(),
  accentColor: z.string().nullable().optional(),
  /** Offer "talk to a human" (creates a help-desk ticket, §11.3) when the
   * bot can't answer. Independent of `enabled`. */
  escalationEnabled: z.boolean(),
  /** Public launcher chrome: floating bubble button vs text-input bar. */
  variant: chatbotWidgetVariantSchema,
  /** Style knobs for the selected variant. */
  widgetStyle: chatbotWidgetStyleSchema,
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
});

export const updateChatbotSettingsBodySchema = z.object({
  enabled: z.boolean().optional(),
  name: z.string().optional(),
  greeting: z.string().optional(),
  /** Pass `null` to clear and fall back to the site theme primary. */
  accentColor: z.string().nullable().optional(),
  escalationEnabled: z.boolean().optional(),
  variant: chatbotWidgetVariantSchema.optional(),
  widgetStyle: chatbotWidgetStylePatchSchema.optional(),
});

export const chatSourceSchema = z.object({
  documentId: z.string(),
  slug: z.string(),
  title: z.string().nullable(),
  anchor: z.string().nullable(),
  kind: z.enum(["blog", "doc", "changelog"]).optional(),
});

/** What `apps/sites` needs to decide whether to mount the floating widget
 * and how to skin it (architecture.md §7.3) — never the escalation flag or
 * timestamps, which are workspace-only concerns. */
export const publicChatbotSettingsSchema = z.object({
  enabled: z.boolean(),
  name: z.string(),
  greeting: z.string().nullable(),
  accentColor: z.string().nullable(),
  variant: chatbotWidgetVariantSchema,
  widgetStyle: chatbotWidgetStyleSchema,
});

export const chatRequestBodySchema = z
  .object({
    message: z.string().trim().max(4000).optional().default(""),
    /** Returned by the first response. Supplying both values appends the
     * message to the same persisted chatbot conversation. */
    conversationId: z.string().optional(),
    conversationToken: z.string().optional(),
    attachmentIds: z.array(z.string().min(1)).max(5).optional(),
    /** Ignored. Persisted ticket messages are the only model history. */
    history: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string(),
        }),
      )
      .max(20)
      .optional(),
  })
  .refine(
    (value) => Boolean(value.conversationId) === Boolean(value.conversationToken),
    {
      message: "conversationId and conversationToken must be provided together",
    },
  )
  .refine(
    (value) => Boolean(value.message?.trim()) || Boolean(value.attachmentIds?.length),
    { message: "A message or at least one attachment is required" },
  );

export const chatAttachmentPresignBodySchema = z
  .object({
    conversationId: z.string().optional(),
    conversationToken: z.string().optional(),
  })
  .refine(
    (value) => Boolean(value.conversationId) === Boolean(value.conversationToken),
    {
      message: "conversationId and conversationToken must be provided together",
    },
  );

export const chatAttachmentCompleteBodySchema = z.object({
  conversationId: z.string().min(1),
  conversationToken: z.string().min(1),
  mediaLitId: z.string().min(1),
  fileName: z.string().min(1).max(255).optional(),
  mimeType: z.string().max(200).optional(),
  size: z.number().int().nonnegative().optional(),
});

export const chatOutcomeSchema = z.enum(["answered", "human_only", "escalated"]);

export const chatResponseSchema = z.object({
  outcome: chatOutcomeSchema,
  answer: z.string().nullable(),
  sources: z.array(chatSourceSchema),
  conversationId: z.string(),
  /** Opaque capability used by the visitor widget to read agent replies
   * without requiring an account. */
  conversationToken: z.string(),
  /** Deprecated compatibility field: true only when outcome is escalated. */
  escalate: z.boolean(),
});
