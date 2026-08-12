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
    PageContent,
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
    "page-content": PageContent,
};

export const LAYOUT_BLOCK_NAMES = ["header", "footer"];
export const NON_ADDABLE_BLOCK_NAMES = [...LAYOUT_BLOCK_NAMES, "page-content"];

export function getWidget(name: string): Widget<any> | undefined {
    return blockRegistry[name];
}

/** Blocks a user can add to the body of a page. */
export function getAddableBlocks(): Widget<any>[] {
    return Object.values(blockRegistry).filter(
        (widget) => !NON_ADDABLE_BLOCK_NAMES.includes(widget.metadata.name),
    );
}
