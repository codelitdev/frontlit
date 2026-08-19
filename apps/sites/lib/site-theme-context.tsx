"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Theme, ThemeStyle } from "@frontlit/page-builder/models";

const SiteThemeContext = createContext<Theme | null>(null);

/** Publishes the resolved site theme to built-in content (feeds, articles)
 * so they can render page-builder primitives without a second fetch. */
export function SiteThemeProvider({
    theme,
    children,
}: {
    theme: Theme;
    children: ReactNode;
}) {
    return (
        <SiteThemeContext.Provider value={theme}>
            {children}
        </SiteThemeContext.Provider>
    );
}

export function useSiteThemeStyle(): ThemeStyle {
    const theme = useContext(SiteThemeContext);
    if (!theme) {
        throw new Error(
            "useSiteThemeStyle must be used under SiteThemeProvider",
        );
    }
    return theme.theme;
}
