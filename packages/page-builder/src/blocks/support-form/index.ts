import type { Widget } from "../../models";
import { supportFormMetadata } from "./metadata";
import { SupportFormWidget } from "./widget";
import { SupportFormEditor } from "./editor";
import { supportFormDefaults } from "./defaults";
import type { SupportFormSettings } from "./settings";

export * from "./settings";

export const SupportForm: Widget<SupportFormSettings> = {
    metadata: supportFormMetadata,
    widget: SupportFormWidget,
    editor: SupportFormEditor,
    getDefaultSettings: () => supportFormDefaults,
    layouts: [{ id: "stacked", name: "Stacked" }],
};
