import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { DEFAULT_SHARED_WIDGETS, teamSettings, themes } from "../db/schema";

const systemThemeIds = new Set([
    "classic",
    "learning",
    "neobrutalism",
    "editorial",
    "midnight",
]);

export class InvalidSiteThemeReferenceError extends Error {}

async function validateSiteThemeReference(
    teamId: string,
    themeId: string | null | undefined,
) {
    if (!themeId || systemThemeIds.has(themeId)) return;

    const theme = await db.query.themes.findFirst({
        where: and(eq(themes.teamId, teamId), eq(themes.themeId, themeId)),
    });
    if (!theme) throw new InvalidSiteThemeReferenceError("Theme not found");
}

export async function getTeamSettings(teamId: string) {
    const existing = await db.query.teamSettings.findFirst({
        where: eq(teamSettings.teamId, teamId),
    });
    if (existing) return existing;

    // Lazily created on first read, same convention as chatbot settings —
    // no dashboard visit needed before a team can query its own defaults.
    const [created] = await db
        .insert(teamSettings)
        .values({
            teamId,
            // Do not rely on the Postgres column default — local DBs keep
            // the old SQL default until migrations are reset.
            sharedWidgets: DEFAULT_SHARED_WIDGETS,
            draftSharedWidgets: DEFAULT_SHARED_WIDGETS,
        })
        .returning();
    return created;
}

export async function updateTeamSettings(
    teamId: string,
    patch: Partial<{
        title: string | null;
        subtitle: string | null;
        logo: Record<string, unknown> | null;
        themeId: string | null;
        codeInjectionHead: string | null;
        codeInjectionBody: string | null;
    }>,
) {
    await validateSiteThemeReference(teamId, patch.themeId);
    const existing = await getTeamSettings(teamId);
    const [updated] = await db
        .update(teamSettings)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(teamSettings.id, existing.id))
        .returning();
    return updated;
}
