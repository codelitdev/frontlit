import type { Widget } from "../../models";
import { bannerMetadata } from "./metadata";
import { BannerWidget } from "./widget";
import { BannerEditor } from "./editor";
import { bannerDefaults } from "./defaults";
import type { BannerSettings } from "./settings";

export * from "./settings";

export const Banner: Widget<BannerSettings> = {
  metadata: bannerMetadata,
  widget: BannerWidget,
  editor: BannerEditor,
  titleSize: true,
  getDefaultSettings: () => bannerDefaults,
  layouts: [
    { id: "stacked", name: "Stacked" },
    { id: "split", name: "Split" },
    { id: "boxed", name: "Boxed" },
  ],
};
