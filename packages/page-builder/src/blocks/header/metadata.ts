import type { WidgetMetadata } from "../../models";

export const headerMetadata: WidgetMetadata = {
  name: "header",
  displayName: "Header",
  description: "The site navigation bar, pinned to the top of every page.",
  compatibleWith: ["site", "landing", "blog", "post", "custom"],
};
