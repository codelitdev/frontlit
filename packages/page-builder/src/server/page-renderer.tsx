import { useId, type ReactNode } from "react";
import type { PageData, Theme, WidgetInstance } from "../models";
import { LAYOUT_BLOCK_NAMES } from "../registry-names";
import { generateThemeStyles } from "../renderer/generate-theme-styles";
import { cn } from "../primitives/lib/utils";
import { serverBlockRegistry } from "./registry";

export interface ServerPageRendererProps {
  layout: WidgetInstance[];
  theme: Theme;
  pageData?: PageData;
  /** Content rendered between the shared header and footer. */
  children?: ReactNode;
  /** Host-resolved data keyed by a generic data-slot's configured name. */
  dataSlots?: Record<string, ReactNode>;
  /** Light/dark control for the footer; a client component owned by the host. */
  themeSwitcher?: ReactNode;
  className?: string;
}

/**
 * Server-component counterpart of `PageRenderer`. Static blocks render on
 * the server and ship no JavaScript; only the interactive parts (mobile menu,
 * marquee, forms, copy buttons, links) are client islands.
 *
 * Everything crossing into an island must be serialisable, so unlike
 * `PageRenderer` this takes no callbacks. Dark-mode styling is CSS-driven
 * (the `dark` class on an ancestor), so no resolved colour mode is needed.
 */
export function ServerPageRenderer({
  layout,
  theme,
  pageData,
  children,
  dataSlots,
  themeSwitcher,
  className,
}: ServerPageRendererProps) {
  const themeScope = `pb-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const header = layout.find((widget) => widget.name === "header");
  const footer = layout.find((widget) => widget.name === "footer");
  const body = layout.filter((widget) => !LAYOUT_BLOCK_NAMES.includes(widget.name));
  const resolvedPageData: PageData = { ...pageData };

  function renderInstance(instance: WidgetInstance) {
    const definition = serverBlockRegistry[instance.name];
    if (!definition) return null;

    const Widget = definition.widget;
    const settings = { ...definition.getDefaultSettings?.(), ...instance.settings };

    return (
      <Widget
        key={instance.widgetId}
        settings={settings}
        state={{ theme }}
        pageData={resolvedPageData}
        data={
          instance.name === "data-slot"
            ? dataSlots?.[String(settings.slot ?? "")]
            : undefined
        }
        themeSwitcher={instance.name === "footer" ? themeSwitcher : undefined}
      />
    );
  }

  return (
    <div
      data-pb-theme={themeScope}
      className={cn(
        "pb-theme flex min-h-full flex-col bg-background text-foreground",
        className,
      )}
    >
      {header && renderInstance(header)}
      <div className="flex flex-1 flex-col">
        {children !== undefined &&
        !body.some((instance) => instance.name === "data-slot")
          ? children
          : body.map(renderInstance)}
      </div>
      {footer && renderInstance(footer)}
      <style>{generateThemeStyles(theme, `[data-pb-theme="${themeScope}"]`)}</style>
    </div>
  );
}
