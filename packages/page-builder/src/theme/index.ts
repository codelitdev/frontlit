/**
 * Theme helpers that are safe to call from React Server Components and light
 * enough to import from client components (the site's chat widget does).
 */
import type { Theme } from "../models";
import { themes } from "../primitives/themes";

export { generateThemeStyles } from "../renderer/generate-theme-styles";
export { themes };

/**
 * Picks the theme a site paints with: a custom `themeStyle` wins, then the
 * stock theme named by `themeId`, then the default theme.
 */
export function resolveTheme(
  themeId: string | null,
  themeStyle: Record<string, unknown> | null,
): Theme {
  if (themeStyle) {
    return {
      id: themeId ?? "custom",
      name: "Custom",
      theme: themeStyle as unknown as Theme["theme"],
    };
  }

  return themes.find((theme) => theme.id === themeId) ?? themes[0];
}
