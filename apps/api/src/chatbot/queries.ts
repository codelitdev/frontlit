import { eq } from "drizzle-orm";
import {
    DEFAULT_CHATBOT_WIDGET_STYLE,
    chatbotWidgetStyleSchema,
    chatbotWidgetVariantSchema,
    type ChatbotWidgetStyle,
    type ChatbotWidgetVariant,
} from "@frontlit/api-contract";
import { db } from "../db/client";
import { chatbotSettings, type ChatbotWidgetStyleRow } from "../db/schema";

export type ChatbotSettingsRow = typeof chatbotSettings.$inferSelect;

export function normalizeWidgetStyle(raw: unknown): ChatbotWidgetStyle {
    const parsed = chatbotWidgetStyleSchema.safeParse(raw ?? {});
    return parsed.success ? parsed.data : DEFAULT_CHATBOT_WIDGET_STYLE;
}

export function normalizeVariant(raw: unknown): ChatbotWidgetVariant {
    const parsed = chatbotWidgetVariantSchema.safeParse(raw);
    return parsed.success ? parsed.data : "bubble";
}

/** Shape returned to routes/MCP — style always fully defaulted. */
export type NormalizedChatbotSettings = Omit<
    ChatbotSettingsRow,
    "variant" | "widgetStyle"
> & {
    variant: ChatbotWidgetVariant;
    widgetStyle: ChatbotWidgetStyle;
};

function normalize(row: ChatbotSettingsRow): NormalizedChatbotSettings {
    return {
        ...row,
        variant: normalizeVariant(row.variant),
        widgetStyle: normalizeWidgetStyle(row.widgetStyle),
    };
}

export async function getChatbotSettings(
    teamId: string,
): Promise<NormalizedChatbotSettings> {
    const existing = await db.query.chatbotSettings.findFirst({
        where: eq(chatbotSettings.teamId, teamId),
    });
    if (existing) return normalize(existing);

    // Settings are created lazily on first read, defaulting to disabled —
    // no dashboard visit is needed before a team can query its own defaults.
    const [created] = await db
        .insert(chatbotSettings)
        .values({ teamId })
        .returning();
    return normalize(created);
}

export async function updateChatbotSettings(
    teamId: string,
    patch: Partial<{
        enabled: boolean;
        name: string;
        greeting: string;
        /** `null` clears the override so the public widget uses the site theme primary. */
        accentColor: string | null;
        escalationEnabled: boolean;
        variant: ChatbotWidgetVariant;
        widgetStyle: Partial<ChatbotWidgetStyleRow>;
    }>,
): Promise<NormalizedChatbotSettings> {
    const existing = await getChatbotSettings(teamId);
    const nextStyle =
        patch.widgetStyle === undefined
            ? existing.widgetStyle
            : normalizeWidgetStyle({
                  ...existing.widgetStyle,
                  ...patch.widgetStyle,
              });

    const [updated] = await db
        .update(chatbotSettings)
        .set({
            ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
            ...(patch.name !== undefined ? { name: patch.name } : {}),
            ...(patch.greeting !== undefined
                ? { greeting: patch.greeting }
                : {}),
            ...(patch.accentColor !== undefined
                ? { accentColor: patch.accentColor }
                : {}),
            ...(patch.escalationEnabled !== undefined
                ? { escalationEnabled: patch.escalationEnabled }
                : {}),
            ...(patch.variant !== undefined ? { variant: patch.variant } : {}),
            widgetStyle: nextStyle,
            updatedAt: new Date(),
        })
        .where(eq(chatbotSettings.id, existing.id))
        .returning();
    return normalize(updated);
}
