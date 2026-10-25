import type {
  Alignment,
  TextEditorContent,
  TitleSettings,
  WidgetDefaultSettings,
} from "../../models";

export type PricingPeriod = "monthly" | "yearly";

export interface PricingTier {
  name: string;
  /** Plain display string, e.g. "$29". No currency/period logic. With the
   * period switch on, this is the monthly price. */
  price: string;
  /** Shown when the switch is on Yearly. Falls back to `price`. */
  priceYearly?: string;
  description?: string;
  features: string[];
  buttonCaption?: string;
  buttonAction?: string;
  /** Button link when the switch is on Yearly. Falls back to `buttonAction`. */
  buttonActionYearly?: string;
  highlighted?: boolean;
}

export interface PricingSettings extends WidgetDefaultSettings, TitleSettings {
  title?: string;
  description?: TextEditorContent;
  headerAlignment?: Alignment;
  tiers?: PricingTier[];
  layout?: "grid" | "stacked" | "highlight";
  /** Show a Monthly/Yearly switch above the plans. */
  pricingSwitcher?: boolean;
  monthlyPriceCaption?: string;
  yearlyPriceCaption?: string;
  /** Period selected when the page loads. Defaults to yearly. */
  defaultPeriod?: PricingPeriod;
}
