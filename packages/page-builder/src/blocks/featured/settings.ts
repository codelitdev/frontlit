import type { Alignment, TextEditorContent, WidgetDefaultSettings } from "../../models";

export interface FeatureItem {
  title: string;
  description?: string;
  /** Name of a lucide-react icon, e.g. "Globe" or "Mail". */
  icon?: string;
}

export interface FeaturedSettings extends WidgetDefaultSettings {
  title?: string;
  description?: TextEditorContent;
  headerAlignment?: Alignment;
  items?: FeatureItem[];
  layout?: "grid" | "list" | "compact" | "numbered";
}
