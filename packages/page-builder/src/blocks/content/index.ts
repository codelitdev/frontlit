import type { Widget } from "../../models";
import { contentMetadata } from "./metadata";
import { ContentWidget } from "./widget";
import { ContentEditor } from "./editor";
import { contentDefaults } from "./defaults";
import type { ContentSettings } from "./settings";

export * from "./settings";

export const Content: Widget<ContentSettings> = {
  metadata: contentMetadata,
  widget: ContentWidget,
  editor: ContentEditor,
  titleSize: true,
  getDefaultSettings: () => contentDefaults,
  layouts: [
    { id: "side", name: "Media beside" },
    { id: "stacked", name: "Media on top" },
    { id: "overlay", name: "Overlay" },
  ],
};
