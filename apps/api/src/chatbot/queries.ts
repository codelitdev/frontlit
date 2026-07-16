import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { chatbotSettings } from "../db/schema";

export async function getChatbotSettings(teamId: string) {
    const existing = await db.query.chatbotSettings.findFirst({ where: eq(chatbotSettings.teamId, teamId) });
    if (existing) return existing;

    // Settings are created lazily on first read, defaulting to disabled —
    // no dashboard visit is needed before a team can query its own defaults.
    const [created] = await db.insert(chatbotSettings).values({ teamId }).returning();
    return created;
}

export async function updateChatbotSettings(
    teamId: string,
    patch: Partial<{ enabled: boolean; name: string; greeting: string; accentColor: string; escalationEnabled: boolean }>,
) {
    const existing = await getChatbotSettings(teamId);
    const [updated] = await db
        .update(chatbotSettings)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(chatbotSettings.id, existing.id))
        .returning();
    return updated;
}
