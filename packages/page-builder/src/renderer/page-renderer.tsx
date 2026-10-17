"use client";

import React, { useEffect, useId, useRef } from "react";
import type { PageData, Theme, WidgetInstance } from "../models";
import { getWidget, LAYOUT_BLOCK_NAMES } from "../registry";
import { EditableBlock } from "./editable-block";
import { generateThemeStyles } from "./generate-theme-styles";
import { cn } from "../primitives/lib/utils";
import {
  PageBuilderLinkProvider,
  type PageBuilderLinkComponent,
} from "../components/nav-link";

export interface PageRendererProps {
  layout: WidgetInstance[];
  theme: Theme;
  pageData: PageData;
  /** Optional content rendered between the shared header and footer. */
  children?: React.ReactNode;
  /** Host-resolved data keyed by a generic data-slot's configured name. */
  dataSlots?: Record<string, React.ReactNode>;
  /** Resolved palette currently painted (`system` is already applied). */
  nextTheme?: "light" | "dark";
  /** Visitor or preview preference, including follow-the-OS. */
  themeMode?: "light" | "dark" | "system";
  onThemeModeChange?: (mode: "light" | "dark" | "system") => void;
  /** When true, renders hover controls (edit/move/delete/add) for use inside the builder canvas. */
  editing?: boolean;
  selectedWidgetId?: string;
  /** Widget to briefly highlight, e.g. right after it was moved. */
  highlightedWidgetId?: string;
  onSelectWidget?: (widgetId: string) => void;
  onMoveWidgetUp?: (widgetId: string) => void;
  onMoveWidgetDown?: (widgetId: string) => void;
  onDeleteWidget?: (widgetId: string) => void;
  onAddWidgetBelow?: (widgetId: string) => void;
  /** Injects the theme's generated CSS custom properties as a `<style>` tag. Disable if the host app renders it elsewhere. */
  injectThemeStyles?: boolean;
  /**
   * Optional host link (e.g. Next.js `Link`) used for internal `/...` paths
   * inside block widgets. Omit it to render native `<a>` tags — no
   * framework dependency.
   */
  linkComponent?: PageBuilderLinkComponent;
  className?: string;
}

/**
 * Renders a page's widget layout using the block registry. Used both for
 * plain (non-editable) display and, with `editing`, as the live canvas
 * inside the page builder.
 */
export function PageRenderer({
  layout,
  theme,
  pageData,
  children,
  dataSlots,
  nextTheme = "light",
  themeMode = "light",
  onThemeModeChange,
  editing = false,
  selectedWidgetId,
  highlightedWidgetId,
  onSelectWidget,
  onMoveWidgetUp,
  onMoveWidgetDown,
  onDeleteWidget,
  onAddWidgetBelow,
  injectThemeStyles = true,
  linkComponent,
  className,
}: PageRendererProps) {
  // Refs to each block's wrapper, keyed by widget id. Refs (unlike DOM
  // attribute lookups) stay correct even when SSR and client render
  // different generated widget ids.
  const blockRefs = useRef(new Map<string, HTMLDivElement>());
  const themeScope = `pb-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const themeSelector = `[data-pb-theme="${themeScope}"]`;

  // Keep the highlighted (just-moved) block in view. Keyed on `layout` too
  // so repeated move clicks on the same widget re-scroll as it travels.
  useEffect(() => {
    if (!highlightedWidgetId) return;
    blockRefs.current
      .get(highlightedWidgetId)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [highlightedWidgetId, layout]);

  const header = layout.find((widget) => widget.name === "header");
  const footer = layout.find((widget) => widget.name === "footer");
  const body = layout.filter((widget) => !LAYOUT_BLOCK_NAMES.includes(widget.name));

  const resolvedPageData: PageData = {
    ...pageData,
  };

  function renderInstance(
    instance: WidgetInstance,
    options: {
      allowUp: boolean;
      allowDown: boolean;
      locked: boolean;
      allowAddBelow: boolean;
    },
  ) {
    const definition = getWidget(instance.name);
    if (!definition) return null;

    const Widget = definition.widget;
    const settings = {
      ...definition.getDefaultSettings?.(),
      ...instance.settings,
    };

    return (
      <EditableBlock
        key={instance.widgetId}
        editing={editing}
        containerRef={(node) => {
          if (node) {
            blockRefs.current.set(instance.widgetId, node);
          } else {
            blockRefs.current.delete(instance.widgetId);
          }
        }}
        selected={selectedWidgetId === instance.widgetId}
        highlighted={highlightedWidgetId === instance.widgetId}
        label={definition.metadata.displayName}
        onSelect={() => onSelectWidget?.(instance.widgetId)}
        onMoveUp={
          options.allowUp ? () => onMoveWidgetUp?.(instance.widgetId) : undefined
        }
        onMoveDown={
          options.allowDown ? () => onMoveWidgetDown?.(instance.widgetId) : undefined
        }
        onDelete={
          !options.locked ? () => onDeleteWidget?.(instance.widgetId) : undefined
        }
        onAddBelow={
          options.allowAddBelow && onAddWidgetBelow
            ? () => onAddWidgetBelow(instance.widgetId)
            : undefined
        }
      >
        <Widget
          settings={settings as any}
          state={{ theme }}
          pageData={resolvedPageData}
          data={
            instance.name === "data-slot"
              ? dataSlots?.[String(settings.slot ?? "")]
              : undefined
          }
          editing={editing}
          nextTheme={nextTheme}
          themeMode={themeMode}
          setThemeMode={onThemeModeChange}
          toggleTheme={
            onThemeModeChange
              ? () => onThemeModeChange(nextTheme === "dark" ? "light" : "dark")
              : undefined
          }
        />
      </EditableBlock>
    );
  }

  return (
    <PageBuilderLinkProvider component={linkComponent}>
      <div
        data-pb-theme={themeScope}
        className={cn(
          "pb-theme flex min-h-full flex-col bg-background text-foreground",
          nextTheme === "dark" && "dark",
          className,
        )}
      >
        {/* Emitted first so the variables exist before any content paints. */}
        {injectThemeStyles && (
          <style>{generateThemeStyles(theme, themeSelector)}</style>
        )}
        {header &&
          renderInstance(header, {
            allowUp: false,
            allowDown: false,
            locked: true,
            allowAddBelow: true,
          })}
        <div className="flex flex-1 flex-col">
          {children !== undefined &&
          !body.some((instance) => instance.name === "data-slot")
            ? children
            : body.map((instance, index) =>
                renderInstance(instance, {
                  allowUp: instance.moveable && index !== 0,
                  allowDown: instance.moveable && index !== body.length - 1,
                  locked: !instance.deletable,
                  allowAddBelow: true,
                }),
              )}
        </div>
        {footer &&
          renderInstance(footer, {
            allowUp: false,
            allowDown: false,
            locked: true,
            allowAddBelow: false,
          })}
      </div>
    </PageBuilderLinkProvider>
  );
}
