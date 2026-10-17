"use client";

import { ThemeModeSwitcher } from "@frontlit/page-builder/islands/theme-mode-switcher";
import { useColorMode } from "@/components/color-mode-provider";
import { useSiteThemeStyle } from "@/lib/site-theme-context";

/** The footer's light/dark control, wired to the visitor's colour mode. */
export function SiteThemeSwitcher() {
  const { resolved, setMode } = useColorMode();
  const theme = useSiteThemeStyle();

  return (
    <ThemeModeSwitcher
      resolved={resolved}
      onToggle={() => setMode(resolved === "dark" ? "light" : "dark")}
      theme={theme}
      size="sm"
      variant="outline"
    />
  );
}
