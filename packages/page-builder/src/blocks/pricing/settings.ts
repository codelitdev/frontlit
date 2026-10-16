import type {
  Alignment,
  TextEditorContent,
  TitleSettings,
  WidgetDefaultSettings,
} from "../../models";

export interface PricingTier {
  name: string;
  /** Plain display string, e.g. "$29/mo". No currency/period logic. */
  price: string;
  description?: string;
  features: string[];
  buttonCaption?: string;
  buttonAction?: string;
  highlighted?: boolean;
}

export interface PricingSettings extends WidgetDefaultSettings, TitleSettings {
  title?: string;
  description?: TextEditorContent;
  headerAlignment?: Alignment;
  tiers?: PricingTier[];
  layout?: "grid" | "stacked" | "highlight";
}
