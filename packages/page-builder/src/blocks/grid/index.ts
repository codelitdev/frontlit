import type { Widget } from "../../models";
import { gridMetadata } from "./metadata";
import { GridWidget } from "./widget";
import { GridEditor } from "./editor";
import { gridDefaults } from "./defaults";
import type { GridSettings } from "./settings";

export * from "./settings";

export const Grid: Widget<GridSettings> = {
    metadata: gridMetadata,
    widget: GridWidget,
    editor: GridEditor,
    getDefaultSettings: () => gridDefaults,
};
