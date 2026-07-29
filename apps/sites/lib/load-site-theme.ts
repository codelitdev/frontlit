import { getPageBySlug } from "./api";

/**
 * Loads the published homepage theme for site chrome (chat widget).
 * Themes are per-page in FrontLit; the homepage is the site-wide default
 * visitors see first, so the chatbot matches that look.
 */
export async function loadSiteTheme(teamId: string): Promise<{
    themeId: string | null;
    themeStyle: Record<string, unknown> | null;
}> {
    const home = await getPageBySlug(teamId, "");
    return {
        themeId: home?.themeId ?? null,
        themeStyle: home?.theme ?? null,
    };
}
