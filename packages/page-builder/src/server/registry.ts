import type { ComponentType } from "react";
import type { WidgetProps } from "../models";
import { HeaderWidget } from "../blocks/header/widget";
import { headerDefaults } from "../blocks/header/defaults";
import { HeroWidget } from "../blocks/hero/widget";
import { heroDefaults } from "../blocks/hero/defaults";
import { ContentWidget } from "../blocks/content/widget";
import { contentDefaults } from "../blocks/content/defaults";
import { FeaturedWidget } from "../blocks/featured/widget";
import { featuredDefaults } from "../blocks/featured/defaults";
import { FaqWidget } from "../blocks/faq/widget";
import { faqDefaults } from "../blocks/faq/defaults";
import { PricingWidget } from "../blocks/pricing/widget";
import { pricingDefaults } from "../blocks/pricing/defaults";
import { BannerWidget } from "../blocks/banner/widget";
import { bannerDefaults } from "../blocks/banner/defaults";
import { EmailFormWidget } from "../blocks/email-form/widget";
import { emailFormDefaults } from "../blocks/email-form/defaults";
import { SupportFormWidget } from "../blocks/support-form/widget";
import { supportFormDefaults } from "../blocks/support-form/defaults";
import { FooterWidget } from "../blocks/footer/widget";
import { footerDefaults } from "../blocks/footer/defaults";
import { RichTextWidget } from "../blocks/rich-text/widget";
import { richTextDefaults } from "../blocks/rich-text/defaults";
import { GridWidget } from "../blocks/grid/widget";
import { gridDefaults } from "../blocks/grid/defaults";
import { MediaWidget } from "../blocks/media/widget";
import { mediaDefaults } from "../blocks/media/defaults";
import { MarqueeWidget } from "../blocks/marquee/widget";
import { marqueeDefaults } from "../blocks/marquee/defaults";
import { EmbedWidget } from "../blocks/embed/widget";
import { embedDefaults } from "../blocks/embed/defaults";
import { CodeSnippetWidget } from "../blocks/code-snippet/widget";
import { codeSnippetDefaults } from "../blocks/code-snippet/defaults";
import { DataSlotWidget } from "../blocks/data-slot/widget";

/**
 * What the server renderer needs from a block: the widget and its default
 * settings. The full `blockRegistry` also carries each block's editor, which
 * pulls the builder UI into the bundle, so the server keeps its own lookup.
 * `server-registry.test.ts` keeps the two in step.
 */
export interface ServerBlock {
  widget: ComponentType<WidgetProps<any>>;
  getDefaultSettings?: () => object;
}

export const serverBlockRegistry: Record<string, ServerBlock> = {
  header: { widget: HeaderWidget, getDefaultSettings: () => headerDefaults },
  hero: { widget: HeroWidget, getDefaultSettings: () => heroDefaults },
  content: { widget: ContentWidget, getDefaultSettings: () => contentDefaults },
  featured: { widget: FeaturedWidget, getDefaultSettings: () => featuredDefaults },
  faq: { widget: FaqWidget, getDefaultSettings: () => faqDefaults },
  pricing: { widget: PricingWidget, getDefaultSettings: () => pricingDefaults },
  banner: { widget: BannerWidget, getDefaultSettings: () => bannerDefaults },
  "email-form": {
    widget: EmailFormWidget,
    getDefaultSettings: () => emailFormDefaults,
  },
  "support-form": {
    widget: SupportFormWidget,
    getDefaultSettings: () => supportFormDefaults,
  },
  footer: { widget: FooterWidget, getDefaultSettings: () => footerDefaults },
  "rich-text": { widget: RichTextWidget, getDefaultSettings: () => richTextDefaults },
  grid: { widget: GridWidget, getDefaultSettings: () => gridDefaults },
  media: { widget: MediaWidget, getDefaultSettings: () => mediaDefaults },
  marquee: { widget: MarqueeWidget, getDefaultSettings: () => marqueeDefaults },
  embed: { widget: EmbedWidget, getDefaultSettings: () => embedDefaults },
  "code-snippet": {
    widget: CodeSnippetWidget,
    getDefaultSettings: () => codeSnippetDefaults,
  },
  "data-slot": { widget: DataSlotWidget },
};
