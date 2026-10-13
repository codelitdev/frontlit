import type { Widget } from "../../models";
import { pricingMetadata } from "./metadata";
import { PricingWidget } from "./widget";
import { PricingEditor } from "./editor";
import { pricingDefaults } from "./defaults";
import type { PricingSettings } from "./settings";

export * from "./settings";

export const Pricing: Widget<PricingSettings> = {
  metadata: pricingMetadata,
  widget: PricingWidget,
  editor: PricingEditor,
  getDefaultSettings: () => pricingDefaults,
  layouts: [
    { id: "grid", name: "Grid" },
    { id: "stacked", name: "Stacked" },
    { id: "highlight", name: "Highlight" },
  ],
};
