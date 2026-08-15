import type { ComponentType, ReactNode } from "react";
import type { Theme } from "./theme";
import type { ThemeStyle } from "./theme-style";
import type { SectionBackground } from "./section-background";

/**
 * The kind of page a widget/block can be placed on. Kept intentionally
 * generic (unlike CourseLit's LMS-specific page types) since FrontLit pages
 * can be a marketing site, a blog post, a changelog entry, etc.
 */
export type PageType = "site" | "blog" | "landing" | "post" | "custom";

export interface WidgetMetadata {
    name: string;
    displayName: string;
    description?: string;
    compatibleWith: PageType[];
    icon?: string;
}

/**
 * A single block placed on a page, as persisted in a page's layout.
 */
export interface WidgetInstance {
    widgetId: string;
    name: string;
    /** Whether the instance can be removed from its page. */
    deletable: boolean;
    /** Whether the instance can be repositioned within its page. */
    moveable: boolean;
    shared: boolean;
    settings?: Record<string, unknown>;
}

/**
 * One of the alternate visual arrangements a block can render its data in.
 * Declared per block via `Widget.layouts`; the user's pick is stored in the
 * instance's `settings.layout` and chosen from the panel's Design tab.
 */
export interface BlockLayout {
    id: string;
    name: string;
}

/**
 * Settings shared by every block, mirroring the common layout controls
 * (max width / vertical padding / background) that CourseLit's theme system
 * exposes to each section.
 */
export interface WidgetDefaultSettings {
    cssId?: string;
    verticalPadding?: ThemeStyle["structure"]["section"]["padding"]["y"];
    maxWidth?: ThemeStyle["structure"]["page"]["width"];
    background?: SectionBackground;
    /** Selected layout id from the block's `layouts`; first layout when unset. */
    layout?: string;
}

export interface PageData extends Record<string, unknown> {
    pageType: PageType;
    /** Tenant branding supplied by the host application. Layout blocks use
     * this on published sites, while the builder can continue to use its
     * own local block settings. */
    siteLogoUrl?: string;
    siteLogoAlt?: string;
    /** The page's team (public id) and slug, plus the base URL of FrontLit's
     * public API — threaded through so blocks that make unauthenticated
     * public calls (e.g. the email-form block's lead capture, architecture.md
     * §10.2) know where to send them. Left unset in contexts with no live
     * backend (e.g. a bare component-library preview), in which case those
     * blocks degrade to a local-only success state. */
    teamId?: string;
    pageSlug?: string;
    publicApiBaseUrl?: string;
}

export interface WidgetProps<
    T extends WidgetDefaultSettings = WidgetDefaultSettings,
> {
    settings: T;
    state: { theme: Theme };
    pageData: PageData;
    /** Host-resolved data rendered by a generic `data-slot` block. */
    data?: ReactNode;
    editing?: boolean;
    nextTheme?: "light" | "dark";
}

export interface WidgetEditorProps<
    T extends WidgetDefaultSettings = WidgetDefaultSettings,
> {
    settings: T;
    theme: Theme;
    onChange: (settings: T) => void;
}

export interface Widget<
    T extends WidgetDefaultSettings = WidgetDefaultSettings,
> {
    metadata: WidgetMetadata;
    widget: ComponentType<WidgetProps<T>>;
    editor?: ComponentType<WidgetEditorProps<T>>;
    getDefaultSettings?: () => Partial<T>;
    /**
     * Alternate layouts this block can render its data in, selectable from
     * the Design tab. The widget reads `settings.layout` while rendering
     * and should treat the first entry as the default.
     */
    layouts?: BlockLayout[];
}
