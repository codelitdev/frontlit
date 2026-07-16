"use client";

import { PageBuilder } from "@frontlit/page-builder";
import { careersLayout, careersTheme } from "./careers-demo";

// A live demo of the WYSIWYG page builder itself: add, remove, reorder and
// edit blocks, and switch between the built-in themes. This is the same
// `PageBuilder` a FrontLit customer would use to design their own site.
//
// Seeded with a Datacurve-style careers page (editorial theme + hero
// eyebrow + overlay image cards + a contour-line pattern background) so
// the demo shows off the builder's fidelity on a real, design-led page
// instead of the generic starter layout — still fully editable from here.
export default function BuilderPage() {
    return (
        <div className="h-screen w-screen">
            <PageBuilder
                pageData={{ pageType: "landing" }}
                initialLayout={careersLayout}
                initialTheme={careersTheme}
            />
        </div>
    );
}
