import type { WidgetMetadata } from "../../models";

export const pageContentMetadata: WidgetMetadata = {
    name: "page-content",
    displayName: "Page content",
    description:
        "The required system content for a standard page, such as its documentation, blog posts, or changelog entries.",
    compatibleWith: ["site", "blog", "landing", "post", "custom"],
};
