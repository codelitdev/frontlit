import type {
  Alignment,
  TextEditorContent,
  TitleSettings,
  WidgetDefaultSettings,
} from "../../models";

export interface BannerSettings extends WidgetDefaultSettings, TitleSettings {
  title?: string;
  description?: TextEditorContent;
  buttonCaption?: string;
  buttonAction?: string;
  secondaryButtonCaption?: string;
  secondaryButtonAction?: string;
  contentAlignment?: Alignment;
  layout?: "stacked" | "split" | "boxed";
}
