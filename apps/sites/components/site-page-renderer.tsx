"use client";

import { PageRenderer } from "@frontlit/page-builder/renderer";
import type { PageData, WidgetInstance } from "@frontlit/page-builder/models";
import { resolveSiteTheme } from "@/lib/site-theme";
import { SiteThemeProvider } from "@/lib/site-theme-context";

/**
 * Thin client wrapper around `PageRenderer`. Theme resolution lives in
 * `@frontlit/page-builder`'s root bundle, which tsup marks `"use client"`
 * end to end (it's bundled alongside the builder's interactive components)
 * — Next.js's RSC boundary forbids *calling* an export of a client module
 * as a plain function from server code, only rendering it as JSX. Resolving
 * the fallback theme here, inside an already-client module, sidesteps that
 * rather than fighting the page-builder package's bundling.
 */
export function SitePageRenderer({
    layout,
    themeId,
    themeStyle,
    pageData,
    siteLogoUrl,
    siteLogoAlt,
    children,
    dataSlots,
}: {
    layout: WidgetInstance[];
    themeId: string | null;
    themeStyle: Record<string, unknown> | null;
    pageData: PageData;
    siteLogoUrl?: string | null;
    siteLogoAlt?: string | null;
    children?: React.ReactNode;
    dataSlots?: Record<string, React.ReactNode>;
}) {
    const theme = resolveSiteTheme(themeId, themeStyle);
    return (
        <SiteThemeProvider theme={theme}>
            <PageRenderer
                layout={layout}
                theme={theme}
                pageData={{
                    ...pageData,
                    ...(siteLogoUrl ? { siteLogoUrl } : {}),
                    ...(siteLogoAlt ? { siteLogoAlt } : {}),
                }}
                dataSlots={dataSlots}
            >
                {children}
            </PageRenderer>
        </SiteThemeProvider>
    );
}
