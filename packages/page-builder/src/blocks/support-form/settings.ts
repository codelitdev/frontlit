import type {
  Alignment,
  TextEditorContent,
  TitleSettings,
  WidgetDefaultSettings,
} from "../../models";

export interface SupportFormSettings extends WidgetDefaultSettings, TitleSettings {
  title?: string;
  description?: TextEditorContent;
  buttonCaption?: string;
  successMessage?: string;
  alignment?: Alignment;
}
