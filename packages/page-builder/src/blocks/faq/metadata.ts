import type { WidgetMetadata } from "../../models";

export const faqMetadata: WidgetMetadata = {
    name: "faq",
    displayName: "FAQs",
    description: "A list of frequently asked questions, rendered as an accordion.",
    compatibleWith: ["site", "landing", "blog", "post", "custom"],
};
