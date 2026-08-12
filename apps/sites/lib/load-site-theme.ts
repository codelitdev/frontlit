import { getSettings } from "./api";

/**
 * Loads FrontLit's single team-level public-site theme. Every page, built-in
 * content route, shared widget and chatbot consumes this same source.
 */
export async function loadSiteTheme(teamId: string): Promise<{
    themeId: string | null;
    themeStyle: Record<string, unknown> | null;
}> {
    const settings = await getSettings(teamId);
    return {
        themeId: settings?.themeId ?? null,
        themeStyle: settings?.theme ?? null,
    };
}
