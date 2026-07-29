import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { teamSettings } from "../db/schema";

export async function getTeamSettings(teamId: string) {
    const existing = await db.query.teamSettings.findFirst({
        where: eq(teamSettings.teamId, teamId),
    });
    if (existing) return existing;

    // Lazily created on first read, same convention as chatbot settings —
    // no dashboard visit needed before a team can query its own defaults.
    const [created] = await db
        .insert(teamSettings)
        .values({ teamId })
        .returning();
    return created;
}

export async function updateTeamSettings(
    teamId: string,
    patch: Partial<{
        title: string;
        subtitle: string;
        logo: Record<string, unknown> | null;
        codeInjectionHead: string | null;
        codeInjectionBody: string | null;
    }>,
) {
    const existing = await getTeamSettings(teamId);
    const [updated] = await db
        .update(teamSettings)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(teamSettings.id, existing.id))
        .returning();
    return updated;
}
