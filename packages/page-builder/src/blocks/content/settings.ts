import type {
  Alignment,
  Media,
  TextEditorContent,
  TitleSettings,
  WidgetDefaultSettings,
} from "../../models";

export interface ContentSettings extends WidgetDefaultSettings, TitleSettings {
  title?: string;
  body?: TextEditorContent;
  media?: Media;
  alignment?: "left" | "right";
  headerAlignment?: Alignment;
  mediaRadius?: number;
  layout?: "side" | "stacked" | "overlay";
}
