import type { WidgetMetadata } from "../../models";

export const mediaMetadata: WidgetMetadata = {
  name: "media",
  displayName: "Media",
  description:
    "A single image or video — YouTube, Vimeo or self-hosted — with an optional click-to-play preview.",
  compatibleWith: ["site", "landing", "blog", "post", "custom"],
};
