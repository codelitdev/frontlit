import type {
  Alignment,
  TextEditorContent,
  TitleSettings,
  WidgetDefaultSettings,
} from "../../models";

export interface EmailFormSettings extends WidgetDefaultSettings, TitleSettings {
  title?: string;
  description?: TextEditorContent;
  buttonCaption?: string;
  successMessage?: string;
  alignment?: Alignment;
  layout?: "stacked" | "split" | "inline";
}
