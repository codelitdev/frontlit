import type { Widget } from "../../models";
import { faqMetadata } from "./metadata";
import { FaqWidget } from "./widget";
import { FaqEditor } from "./editor";
import { faqDefaults } from "./defaults";
import type { FaqSettings } from "./settings";

export * from "./settings";

export const Faq: Widget<FaqSettings> = {
  metadata: faqMetadata,
  widget: FaqWidget,
  editor: FaqEditor,
  getDefaultSettings: () => faqDefaults,
  layouts: [
    { id: "list", name: "List" },
    { id: "cards", name: "Cards" },
    { id: "columns", name: "Columns" },
  ],
};
