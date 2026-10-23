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
    deletable: !["header", "footer", "data-slot"].includes(name),
    moveable: !["header", "footer"].includes(name),
    shared: ["header", "footer"].includes(name),
    settings: {
      ...(definition?.getDefaultSettings?.() ?? {}),
      ...(overrides ?? {}),
    },
  };
}

/** Fills each block's unset settings with its defaults. Saved layouts omit
 * settings equal to a default (the renderer merges them back), so the
 * builder's panels need them filled in to show what's on the canvas. */
export function withDefaultSettings(layout: WidgetInstance[]): WidgetInstance[] {
  return layout.map((widget) => {
    const defaults = blockRegistry[widget.name]?.getDefaultSettings?.();
    return defaults
      ? { ...widget, settings: { ...defaults, ...widget.settings } }
      : widget;
  });
}

/** Ensures a builder layout always has one locked header and footer.
 * API validation remains the hard boundary; this repair keeps legacy/empty
 * initial layouts usable and prevents the UI from ever presenting a page
 * without its shared navigation shell. */
export function ensureRequiredSharedWidgets(
  layout: WidgetInstance[],
): WidgetInstance[] {
  const header =
    layout.find((widget) => widget.name === "header") ?? createWidgetInstance("header");
  const footer =
    layout.find((widget) => widget.name === "footer") ?? createWidgetInstance("footer");
  const body = layout.filter((widget) => !["header", "footer"].includes(widget.name));

  return [
    {
      ...header,
      name: "header",
      deletable: false,
      moveable: false,
      shared: true,
    },
    ...body,
    {
      ...footer,
      name: "footer",
      deletable: false,
      moveable: false,
      shared: true,
    },
  ];
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
  return ensureRequiredSharedWidgets([
    createWidgetInstance("header", { ctaHref: "/builder" }),
    createWidgetInstance("hero", { buttonAction: "/builder" }),
    createWidgetInstance("featured"),
    createWidgetInstance("content"),
    createWidgetInstance("pricing"),
    createWidgetInstance("faq"),
    createWidgetInstance("email-form"),
    createWidgetInstance("footer"),
  ]);
}
