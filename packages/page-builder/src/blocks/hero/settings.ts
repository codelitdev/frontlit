import type {
  Alignment,
  Media,
  TextEditorContent,
  WidgetDefaultSettings,
} from "../../models";

export interface HeroSettings extends WidgetDefaultSettings {
  /** Small label rendered above the title, e.g. a section eyebrow like "Careers". */
  preTitle?: string;
  title?: string;
  description?: TextEditorContent;
  buttonCaption?: string;
  buttonAction?: string;
  secondaryButtonCaption?: string;
  secondaryButtonAction?: string;
  /** Optional line of small print under the buttons, e.g. "No credit card required". */
  smallPrint?: string;
  media?: Media;
  youtubeLink?: string;
  alignment?: Alignment | "right";
  contentAlignment?: Alignment;
  mediaRadius?: number;
  layout?: "normal" | "card" | "centered" | "media-below";
}
