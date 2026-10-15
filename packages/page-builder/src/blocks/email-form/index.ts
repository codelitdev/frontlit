import type { Widget } from "../../models";
import { emailFormMetadata } from "./metadata";
import { EmailFormWidget } from "./widget";
import { EmailFormEditor } from "./editor";
import { emailFormDefaults } from "./defaults";
import type { EmailFormSettings } from "./settings";

export * from "./settings";

export const EmailForm: Widget<EmailFormSettings> = {
  metadata: emailFormMetadata,
  widget: EmailFormWidget,
  editor: EmailFormEditor,
  titleSize: true,
  getDefaultSettings: () => emailFormDefaults,
  layouts: [
    { id: "stacked", name: "Stacked" },
    { id: "split", name: "Split" },
    { id: "inline", name: "Inline" },
  ],
};
