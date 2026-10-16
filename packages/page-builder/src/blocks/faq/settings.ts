import type { Alignment, TitleSettings, WidgetDefaultSettings } from "../../models";

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export interface FaqSettings extends WidgetDefaultSettings, TitleSettings {
  title?: string;
  headerAlignment?: Alignment;
  items?: FaqItem[];
  layout?: "list" | "cards" | "columns";
}
