import type { Widget } from "../../models";
import { featuredMetadata } from "./metadata";
import { FeaturedWidget } from "./widget";
import { FeaturedEditor } from "./editor";
import { featuredDefaults } from "./defaults";
import type { FeaturedSettings } from "./settings";

export * from "./settings";

export const Featured: Widget<FeaturedSettings> = {
  metadata: featuredMetadata,
  widget: FeaturedWidget,
  editor: FeaturedEditor,
  titleSize: true,
  getDefaultSettings: () => featuredDefaults,
  layouts: [
    { id: "grid", name: "Grid" },
    { id: "list", name: "List" },
    { id: "compact", name: "Compact" },
    { id: "numbered", name: "Numbered" },
  ],
};
