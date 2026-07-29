"use client";

import type { Theme } from "@frontlit/page-builder/models";
import { themes } from "@frontlit/page-builder/primitives";

export function resolvePageTheme(
  themeId: string | null,
  savedStyle: Record<string, unknown> | null,
): Theme | null {
  if (savedStyle) {
    return {
      id: themeId ?? "custom",
      name: "Custom",
      theme: savedStyle as unknown as Theme["theme"],
    };
  }

  return themes.find((theme) => theme.id === themeId) ?? null;
}
