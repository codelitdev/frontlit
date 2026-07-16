import type { Widget } from "../../models";
import { headerMetadata } from "./metadata";
import { HeaderWidget } from "./widget";
import { HeaderEditor } from "./editor";
import { headerDefaults } from "./defaults";
import type { HeaderSettings } from "./settings";

export * from "./settings";

export const Header: Widget<HeaderSettings> = {
    metadata: headerMetadata,
    widget: HeaderWidget,
    editor: HeaderEditor,
    getDefaultSettings: () => headerDefaults,
    layouts: [
        { id: "fixed", name: "Fixed" },
        { id: "floating", name: "Floating" },
        { id: "centered", name: "Centered logo" },
    ],
};
