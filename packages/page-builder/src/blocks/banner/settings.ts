import type { Alignment, TextEditorContent, WidgetDefaultSettings } from "../../models";

export interface BannerSettings extends WidgetDefaultSettings {
  title?: string;
  description?: TextEditorContent;
  buttonCaption?: string;
  buttonAction?: string;
  secondaryButtonCaption?: string;
  secondaryButtonAction?: string;
  contentAlignment?: Alignment;
  layout?: "stacked" | "split" | "boxed";
}
