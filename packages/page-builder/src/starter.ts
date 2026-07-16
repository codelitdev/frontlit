import type { Theme, WidgetInstance } from "./models";
import { generateUniqueId } from "./utils";
import { themes } from "./primitives";
import { blockRegistry } from "./registry";

/**
 * Creates a new widget instance for the given block name, seeded with that
 * block's default settings.
 */
export function createWidgetInstance(
    name: string,
    overrides?: Record<string, unknown>,
): WidgetInstance {
    const definition = blockRegistry[name];
    return {
        widgetId: generateUniqueId(),
        name,
        deleteable: !["header", "footer"].includes(name),
        shared: ["header", "footer"].includes(name),
        settings: {
            ...(definition?.getDefaultSettings?.() ?? {}),
            ...(overrides ?? {}),
        },
    };
}

/** The default theme new pages start out with. */
export function getDefaultTheme(): Theme {
    return themes[0];
}

/**
 * A complete, ready-to-render landing page layout showcasing every
 * available block — used both as the FrontLit marketing landing page and
 * as the page builder demo's starting point.
 */
export function createDefaultLayout(): WidgetInstance[] {
    return [
        createWidgetInstance("header", { ctaHref: "/builder" }),
        createWidgetInstance("hero", { buttonAction: "/builder" }),
        createWidgetInstance("featured"),
        createWidgetInstance("content"),
        createWidgetInstance("pricing"),
        createWidgetInstance("faq"),
        createWidgetInstance("email-form"),
        createWidgetInstance("footer"),
    ];
}
