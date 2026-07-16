"use client";

import { PageRenderer, createDefaultLayout, getDefaultTheme } from "@frontlit/page-builder";

// The FrontLit marketing landing page is itself built with, and rendered
// by, @frontlit/page-builder — the same renderer that powers the /builder
// demo and, eventually, every site a FrontLit user publishes.
export default function HomePage() {
    const layout = createDefaultLayout();
    const theme = getDefaultTheme();

    return (
        <PageRenderer
            layout={layout}
            theme={theme}
            pageData={{ pageType: "landing" }}
        />
    );
}
