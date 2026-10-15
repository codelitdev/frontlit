"use client";

import React, { useState } from "react";
import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import type { WidgetProps, ThemeStyle } from "../../models";
import type { FaqSettings } from "./settings";
import { renderTitle, titleProps } from "../_shared/title";
import { Header2, Section, Text1 } from "../../primitives";

export function FaqWidget({
  settings: {
    title,
    titleLevel,
    titleSize,
    headerAlignment = "left",
    items = [],
    layout = "list",
    cssId,
    maxWidth,
    verticalPadding,
    background,
  },
  state: { theme },
  nextTheme,
}: WidgetProps<FaqSettings>) {
  const overriddenTheme: ThemeStyle = JSON.parse(JSON.stringify(theme.theme));
  overriddenTheme.structure.page.width = maxWidth || theme.theme.structure.page.width;
  overriddenTheme.structure.section.padding.y =
    verticalPadding || theme.theme.structure.section.padding.y;

  const [expandedIndex, setExpandedIndex] = useState<number | null>(
    items.length > 0 ? 0 : null,
  );

  return (
    <Section
      theme={overriddenTheme}
      id={cssId}
      background={background}
      nextTheme={nextTheme}
    >
      <div className="flex flex-col gap-6">
        {title && (
          <div
            className={clsx(
              "flex flex-col",
              headerAlignment === "center" ? "items-center text-center" : "items-start",
            )}
          >
            <Header2 theme={overriddenTheme} {...titleProps({ titleLevel, titleSize })}>
              {renderTitle(title, overriddenTheme)}
            </Header2>
          </div>
        )}
        {items.length > 0 &&
          (() => {
            const renderItem = (item: (typeof items)[number], index: number) => {
              const isOpen = expandedIndex === index;
              return (
                <div
                  key={item.id}
                  className={
                    layout === "cards"
                      ? "rounded-lg border border-border bg-card px-4 py-4"
                      : layout === "columns"
                        ? "border-b border-border py-4"
                        : "py-4"
                  }
                >
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-4 text-left"
                    onClick={() => setExpandedIndex(isOpen ? null : index)}
                    aria-expanded={isOpen}
                  >
                    <Text1 theme={overriddenTheme} className="font-medium">
                      {item.question}
                    </Text1>
                    <ChevronDown
                      className={clsx(
                        "h-4 w-4 shrink-0 transition-transform",
                        isOpen && "rotate-180",
                      )}
                    />
                  </button>
                  {isOpen && (
                    <div className="pt-3">
                      <Text1 theme={overriddenTheme} className="text-muted-foreground">
                        {item.answer}
                      </Text1>
                    </div>
                  )}
                </div>
              );
            };

            if (layout === "columns") {
              // Two side-by-side lists — the left column gets
              // the first half of items, the right column the
              // rest, a common layout for FAQ sections with
              // many questions.
              const half = Math.ceil(items.length / 2);
              const left = items.slice(0, half);
              const right = items.slice(half);
              return (
                <div className="grid grid-cols-1 gap-x-10 md:grid-cols-2">
                  <div className="flex flex-col">
                    {left.map((item, i) => renderItem(item, i))}
                  </div>
                  <div className="flex flex-col">
                    {right.map((item, i) => renderItem(item, half + i))}
                  </div>
                </div>
              );
            }

            return (
              <div
                className={
                  layout === "cards"
                    ? "flex flex-col gap-3"
                    : "flex flex-col divide-y divide-border border-b border-t border-border"
                }
              >
                {items.map((item, index) => renderItem(item, index))}
              </div>
            );
          })()}
      </div>
    </Section>
  );
}
