import type { WidgetMetadata } from "../../models";

export const embedMetadata: WidgetMetadata = {
  name: "embed",
  displayName: "Embed",
  description:
    "Embed a URL in an iframe, or paste a script/iframe snippet from a third-party tool.",
  compatibleWith: ["site", "landing", "blog", "post", "custom"],
};
