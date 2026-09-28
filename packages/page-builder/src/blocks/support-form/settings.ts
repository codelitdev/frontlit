import type { Alignment, TextEditorContent, WidgetDefaultSettings } from "../../models";

export interface SupportFormSettings extends WidgetDefaultSettings {
  title?: string;
  description?: TextEditorContent;
  buttonCaption?: string;
  successMessage?: string;
  alignment?: Alignment;
}
