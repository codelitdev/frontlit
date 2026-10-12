import type { Widget } from "./models";
import {
  Header,
  Hero,
  Content,
  Featured,
  Faq,
  Pricing,
  Banner,
  EmailForm,
  SupportForm,
  Footer,
  RichText,
  Grid,
  MediaBlock,
  Marquee,
  Embed,
  DataSlot,
} from "./blocks";

/**
 * Every block available to the page builder, keyed by its
 * `metadata.name`. `header` and `footer` are singleton, layout-level
 * blocks placed outside the normal flow by the renderer.
 */
export const blockRegistry: Record<string, Widget<any>> = {
  header: Header,
  hero: Hero,
  content: Content,
  featured: Featured,
  faq: Faq,
  pricing: Pricing,
  banner: Banner,
  "email-form": EmailForm,
  "support-form": SupportForm,
  footer: Footer,
  "rich-text": RichText,
  grid: Grid,
  media: MediaBlock,
  marquee: Marquee,
  embed: Embed,
  "data-slot": DataSlot,
};

export const LAYOUT_BLOCK_NAMES = ["header", "footer"];
export const NON_ADDABLE_BLOCK_NAMES = [...LAYOUT_BLOCK_NAMES, "data-slot"];

/**
 * Adds a host application's block to the shared renderer and builder
 * registry. Register blocks while the application module initializes, before
 * rendering either `PageBuilder` or `PageRenderer`.
 *
 * Built-in names are intentionally protected: a persisted page must always
 * have one stable implementation for a block name. Give host blocks a
 * namespaced name such as `acme-event-list`.
 */
export function registerBlock(widget: Widget<any>): void {
  const name = widget.metadata.name.trim();
  if (!name) {
    throw new Error("A page-builder block must have a non-empty name.");
  }
  if (blockRegistry[name]) {
    throw new Error(`A page-builder block named \"${name}\" is already registered.`);
  }
  if (NON_ADDABLE_BLOCK_NAMES.includes(name)) {
    throw new Error(
      `\"${name}\" is a reserved page-builder block name and cannot be registered by a host application.`,
    );
  }
  blockRegistry[name] = widget;
}

export function getWidget(name: string): Widget<any> | undefined {
  return blockRegistry[name];
}

/** Blocks a user can add to the body of a page. */
export function getAddableBlocks(): Widget<any>[] {
  return Object.values(blockRegistry).filter(
    (widget) => !NON_ADDABLE_BLOCK_NAMES.includes(widget.metadata.name),
  );
}
