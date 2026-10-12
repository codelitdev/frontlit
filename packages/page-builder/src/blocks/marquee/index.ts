import type { Widget } from "../../models";
import { marqueeMetadata } from "./metadata";
import { MarqueeWidget } from "./widget";
import { MarqueeEditor } from "./editor";
import { marqueeDefaults } from "./defaults";
import type { MarqueeSettings } from "./settings";

export * from "./settings";

export const Marquee: Widget<MarqueeSettings> = {
  metadata: marqueeMetadata,
  widget: MarqueeWidget,
  editor: MarqueeEditor,
  getDefaultSettings: () => marqueeDefaults,
};
