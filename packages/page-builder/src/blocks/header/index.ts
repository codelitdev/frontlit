import type { Widget } from "../../models";
import { headerMetadata } from "./metadata";
import { HeaderWidget } from "./widget";
import { HeaderDesignEditor, HeaderEditor } from "./editor";
import { headerDefaults } from "./defaults";
import type { HeaderSettings } from "./settings";

export * from "./settings";

export const Header: Widget<HeaderSettings> = {
  metadata: headerMetadata,
  widget: HeaderWidget,
  editor: HeaderEditor,
  designEditor: HeaderDesignEditor,
  getDefaultSettings: () => headerDefaults,
  layouts: [
    { id: "fixed", name: "Fixed" },
    { id: "floating", name: "Floating" },
    { id: "centered", name: "Centered logo" },
  ],
};
