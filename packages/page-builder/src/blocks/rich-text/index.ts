import type { Widget } from "../../models";
import { richTextMetadata } from "./metadata";
import { RichTextWidget } from "./widget";
import { RichTextEditor } from "./editor";
import { richTextDefaults } from "./defaults";
import type { RichTextSettings } from "./settings";

export * from "./settings";

export const RichText: Widget<RichTextSettings> = {
    metadata: richTextMetadata,
    widget: RichTextWidget,
    editor: RichTextEditor,
    getDefaultSettings: () => richTextDefaults,
};
