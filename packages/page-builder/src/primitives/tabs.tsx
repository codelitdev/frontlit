"use client";

import React from "react";
import type { ThemeStyle } from "../models";
import { cn } from "./lib/utils";

export interface TabsItem {
  label: React.ReactNode;
  content: React.ReactNode;
}

export interface TabsProps {
  items: TabsItem[];
  /** Accessible name of the tab list. */
  label: string;
  defaultIndex?: number;
  theme?: ThemeStyle;
  className?: string;
}

/**
 * Accessible tabs (WAI-ARIA tab pattern with arrow-key navigation). Every
 * panel is rendered, inactive ones `hidden`, so server-rendered content is
 * in the HTML before hydration.
 */
export function Tabs({ items, label, defaultIndex = 0, theme, className }: TabsProps) {
  const [active, setActive] = React.useState(
    Math.min(Math.max(defaultIndex, 0), Math.max(items.length - 1, 0)),
  );
  const id = React.useId();
  const tabs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const typography = theme?.typography?.text2;

  const select = (index: number) => {
    const next = (index + items.length) % items.length;
    setActive(next);
    tabs.current[next]?.focus();
  };

  return (
    <div className={cn("flex min-w-0 flex-col gap-3", className)}>
      <div
        role="tablist"
        aria-label={label}
        className="flex min-w-0 gap-1 overflow-x-auto overflow-y-hidden border-b border-border [scrollbar-width:none]"
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") select(active + 1);
          else if (event.key === "ArrowLeft") select(active - 1);
          else if (event.key === "Home") select(0);
          else if (event.key === "End") select(items.length - 1);
          else return;
          event.preventDefault();
        }}
      >
        {items.map((item, index) => (
          <button
            key={index}
            ref={(element) => {
              tabs.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${index}`}
            aria-selected={index === active}
            aria-controls={`${id}-panel-${index}`}
            tabIndex={index === active ? 0 : -1}
            onClick={() => setActive(index)}
            className={cn(
              "shrink-0 whitespace-nowrap border-b-2 px-3 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              typography?.fontFamily,
              typography?.fontSize ?? "text-sm",
              typography?.letterSpacing,
              index === active
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      {items.map((item, index) => (
        <div
          key={index}
          role="tabpanel"
          id={`${id}-panel-${index}`}
          aria-labelledby={`${id}-tab-${index}`}
          hidden={index !== active}
          className="min-w-0"
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}
