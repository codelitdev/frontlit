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
};

export const LAYOUT_BLOCK_NAMES = ["header", "footer"];

export function getWidget(name: string): Widget<any> | undefined {
    return blockRegistry[name];
}

/** Blocks a user can add to the body of a page (excludes header/footer). */
export function getAddableBlocks(): Widget<any>[] {
    return Object.values(blockRegistry).filter(
        (widget) => !LAYOUT_BLOCK_NAMES.includes(widget.metadata.name),
    );
}
