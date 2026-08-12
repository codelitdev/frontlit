"use client";

import { PageRenderer } from "@frontlit/page-builder/renderer";
import type { PageData, WidgetInstance } from "@frontlit/page-builder/models";
import { resolveSiteTheme } from "@/lib/site-theme";

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
    children,
}: {
    layout: WidgetInstance[];
    themeId: string | null;
    themeStyle: Record<string, unknown> | null;
    pageData: PageData;
    children?: React.ReactNode;
}) {
    const theme = resolveSiteTheme(themeId, themeStyle);
    return (
        <PageRenderer layout={layout} theme={theme} pageData={pageData}>
            {children}
        </PageRenderer>
    );
}
