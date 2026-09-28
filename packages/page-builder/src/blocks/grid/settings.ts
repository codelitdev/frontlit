import type {
  Alignment,
  Media,
  TextEditorContent,
  WidgetDefaultSettings,
} from "../../models";

export interface GridItem {
  title: string;
  description?: string;
  /** Name of a lucide-react icon; ignored when `media` is set. */
  icon?: string;
  media?: Media;
  /**
   * Whether the image renders above or below the title/description, or
   * as a full-bleed background with the title overlaid on top of it
   * (a "photo card" pattern — team/role/portfolio grids).
   */
  mediaAlignment?: "top" | "bottom" | "overlay";
  buttonCaption?: string;
  /** Card destination. In the "overlay" layout the whole card becomes a link when this is set, even without a caption. */
  buttonAction?: string;
}

export interface GridSettings extends WidgetDefaultSettings {
  title?: string;
  description?: TextEditorContent;
  headerAlignment?: Alignment;
  buttonCaption?: string;
  buttonAction?: string;
  items?: GridItem[];
  columns?: 2 | 3;
}
