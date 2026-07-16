import type { Widget } from "../../models";
import { mediaMetadata } from "./metadata";
import { MediaWidget } from "./widget";
import { MediaEditor } from "./editor";
import { mediaDefaults } from "./defaults";
import type { MediaSettings } from "./settings";

export * from "./settings";

export const MediaBlock: Widget<MediaSettings> = {
    metadata: mediaMetadata,
    widget: MediaWidget,
    editor: MediaEditor,
    getDefaultSettings: () => mediaDefaults,
};
