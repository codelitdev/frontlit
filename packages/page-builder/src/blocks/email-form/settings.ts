import type { Alignment, TextEditorContent, WidgetDefaultSettings } from "../../models";

export interface EmailFormSettings extends WidgetDefaultSettings {
  title?: string;
  description?: TextEditorContent;
  buttonCaption?: string;
  successMessage?: string;
  alignment?: Alignment;
  layout?: "stacked" | "split" | "inline";
}
