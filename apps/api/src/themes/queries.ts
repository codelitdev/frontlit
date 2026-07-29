import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { pages, themes } from "../db/schema";

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

/** Looks up by internal id — used to resolve a page's `themeId` FK for
 * public rendering (architecture.md §12.2), where only the internal id is
 * on hand. */
export async function getThemeById(id: string) {
    return db.query.themes.findFirst({ where: eq(themes.id, id) });
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
            .update(pages)
            .set({ themeId: null })
            .where(eq(pages.themeId, existing.themeId));
        await tx.delete(themes).where(eq(themes.id, existing.id));
    });
}
