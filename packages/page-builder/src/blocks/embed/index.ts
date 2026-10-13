import type { Widget } from "../../models";
import { embedMetadata } from "./metadata";
import { EmbedWidget } from "./widget";
import { EmbedEditor } from "./editor";
import { embedDefaults } from "./defaults";
import type { EmbedSettings } from "./settings";

export * from "./settings";

export const Embed: Widget<EmbedSettings> = {
  metadata: embedMetadata,
  widget: EmbedWidget,
  editor: EmbedEditor,
  getDefaultSettings: () => embedDefaults,
};
