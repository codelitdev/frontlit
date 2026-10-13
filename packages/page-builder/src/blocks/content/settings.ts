import type {
  Alignment,
  Media,
  TextEditorContent,
  WidgetDefaultSettings,
} from "../../models";

export interface ContentSettings extends WidgetDefaultSettings {
  title?: string;
  body?: TextEditorContent;
  media?: Media;
  alignment?: "left" | "right";
  headerAlignment?: Alignment;
  mediaRadius?: number;
  layout?: "side" | "stacked" | "overlay";
}
