import type { WidgetMetadata } from "../../models";

export const contentMetadata: WidgetMetadata = {
  name: "content",
  displayName: "Content",
  description:
    "A rich-text section with an optional image, for things like an about-us or feature explainer.",
  compatibleWith: ["site", "landing", "blog", "post", "custom"],
  icon: "Newspaper",
};
