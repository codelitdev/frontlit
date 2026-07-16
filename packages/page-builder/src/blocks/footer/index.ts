import type { Widget } from "../../models";
import { footerMetadata } from "./metadata";
import { FooterWidget } from "./widget";
import { FooterEditor } from "./editor";
import { footerDefaults } from "./defaults";
import type { FooterSettings } from "./settings";

export * from "./settings";

export const Footer: Widget<FooterSettings> = {
    metadata: footerMetadata,
    widget: FooterWidget,
    editor: FooterEditor,
    getDefaultSettings: () => footerDefaults,
    layouts: [
        { id: "columns", name: "Columns" },
        { id: "centered", name: "Centered" },
        { id: "minimal", name: "Minimal" },
    ],
};
