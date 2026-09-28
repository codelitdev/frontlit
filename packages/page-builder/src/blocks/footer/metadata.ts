import type { WidgetMetadata } from "../../models";

export const footerMetadata: WidgetMetadata = {
  name: "footer",
  displayName: "Footer",
  description: "The site footer, pinned to the bottom of every page.",
  compatibleWith: ["site", "landing", "blog", "post", "custom"],
};
