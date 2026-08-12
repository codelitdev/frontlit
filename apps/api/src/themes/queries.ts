import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { teamSettings, themes } from "../db/schema";

export async function createTheme(input: {
    teamId: string;
    name: string;
    style: Record<string, unknown>;
}) {
    const [theme] = await db.insert(themes).values(input).returning();
    return theme;
}

export async function listThemes(teamId: string) {
    return db.query.themes.findMany({
        where: eq(themes.teamId, teamId),
        orderBy: (row, { desc }) => desc(row.updatedAt),
    });
}

export async function getThemeByThemeId(themeId: string) {
    return db.query.themes.findFirst({ where: eq(themes.themeId, themeId) });
}

export async function updateTheme(
    teamId: string,
    themeId: string,
    patch: Partial<{ name: string; style: Record<string, unknown> }>,
) {
    const existing = await getThemeByThemeId(themeId);
    if (!existing || existing.teamId !== teamId) return null;

    const [theme] = await db
        .update(themes)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(themes.id, existing.id))
        .returning();
    return theme;
}

export async function deleteTheme(teamId: string, themeId: string) {
    const existing = await getThemeByThemeId(themeId);
    if (!existing || existing.teamId !== teamId) return;
    await db.transaction(async (tx) => {
        await tx
            .update(teamSettings)
            .set({ themeId: null })
            .where(eq(teamSettings.themeId, existing.themeId));
        await tx.delete(themes).where(eq(themes.id, existing.id));
    });
}
