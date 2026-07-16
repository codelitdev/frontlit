"use client";

import { PageRenderer } from "@frontlit/page-builder/renderer";
import { getDefaultTheme } from "@frontlit/page-builder";
import type { PageData, Theme, WidgetInstance } from "@frontlit/page-builder/models";

/**
 * Thin client wrapper around `PageRenderer`. `getDefaultTheme()` lives in
 * `@frontlit/page-builder`'s root bundle, which tsup marks `"use client"`
 * end to end (it's bundled alongside the builder's interactive components)
 * — Next.js's RSC boundary forbids *calling* an export of a client module
 * as a plain function from server code, only rendering it as JSX. Resolving
 * the fallback theme here, inside an already-client module, sidesteps that
 * rather than fighting the page-builder package's bundling.
 */
export function SitePageRenderer({ layout, theme, pageData }: { layout: WidgetInstance[]; theme: Theme | null; pageData: PageData }) {
    return <PageRenderer layout={layout} theme={theme ?? getDefaultTheme()} pageData={pageData} />;
}
