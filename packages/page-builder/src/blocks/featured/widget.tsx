import React from "react";
import clsx from "clsx";
import * as Icons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ThemeStyle, WidgetProps } from "../../models";
import type { FeaturedSettings } from "./settings";
import { renderTitle, titleProps } from "../_shared/title";
import { TextRenderer } from "../../components";
import {
  Header1,
  Header4,
  PageCard,
  PageCardContent,
  Section,
  Subheader1,
  Text2,
} from "../../primitives";

/**
 * Resolves a lucide-react icon by name, falling back to a safe default when
 * the configured name doesn't match a known icon (e.g. a typo in settings).
 */
function resolveIcon(name?: string): LucideIcon {
  if (!name) return Icons.Sparkles;
  const icon = (Icons as unknown as Record<string, LucideIcon>)[name];
  // Lucide icons are `React.forwardRef` components (objects), not plain
  // functions, so we can't gate on `typeof icon === "function"` here.
  return icon ?? Icons.Sparkles;
}

export function FeaturedWidget({
  settings: {
    title,
    titleLevel,
    titleSize,
    description,
    headerAlignment = "center",
    items,
    layout = "grid",
    cssId,
    maxWidth,
    verticalPadding,
    background,
  },
  state: { theme },
  nextTheme,
}: WidgetProps<FeaturedSettings>) {
  const overriddenTheme: ThemeStyle = JSON.parse(JSON.stringify(theme.theme));
  overriddenTheme.structure.page.width = maxWidth || theme.theme.structure.page.width;
  overriddenTheme.structure.section.padding.y =
    verticalPadding || theme.theme.structure.section.padding.y;

  return (
    <Section
      theme={overriddenTheme}
      id={cssId}
      background={background}
      nextTheme={nextTheme}
    >
      <div className="flex flex-col gap-8">
        <div
          className={clsx(
            "flex flex-col gap-4",
            headerAlignment === "center" ? "items-center text-center" : "items-start",
          )}
        >
          <Header1 theme={overriddenTheme} {...titleProps({ titleLevel, titleSize })}>
            {renderTitle(title, overriddenTheme)}
          </Header1>
          {description && (
            <Subheader1 theme={overriddenTheme} component="span">
              <TextRenderer json={description} theme={overriddenTheme} />
            </Subheader1>
          )}
        </div>
        {items && items.length > 0 && layout === "numbered" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {items.map((item, index) => (
              <div key={index} className="flex flex-col gap-2">
                <span className="text-3xl font-bold text-primary/30">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <Header4 theme={overriddenTheme}>{item.title}</Header4>
                {item.description && (
                  <Text2 theme={overriddenTheme}>{item.description}</Text2>
                )}
              </div>
            ))}
          </div>
        )}
        {items && items.length > 0 && layout !== "numbered" && (
          <div
            className={clsx(
              layout === "list" && "flex flex-col gap-4",
              layout === "compact" &&
                "grid grid-cols-2 md:grid-cols-4 gap-4 items-stretch",
              layout !== "list" &&
                layout !== "compact" &&
                "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch",
            )}
          >
            {items.map((item, index) => {
              const Icon = resolveIcon(item.icon);
              return (
                <PageCard key={index} theme={overriddenTheme}>
                  <PageCardContent
                    theme={overriddenTheme}
                    className={clsx(
                      "h-full flex gap-3",
                      layout === "list" ? "flex-row items-start" : "flex-col",
                      layout === "compact" && "items-center text-center gap-2",
                    )}
                  >
                    <div
                      className={clsx(
                        "flex shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary",
                        layout === "compact" ? "h-8 w-8" : "h-10 w-10",
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div
                      className={clsx(
                        "flex flex-col gap-2",
                        layout === "compact" && "items-center gap-1",
                      )}
                    >
                      <Header4 theme={overriddenTheme}>{item.title}</Header4>
                      {item.description && layout !== "compact" && (
                        <Text2 theme={overriddenTheme}>{item.description}</Text2>
                      )}
                    </div>
                  </PageCardContent>
                </PageCard>
              );
            })}
          </div>
        )}
      </div>
    </Section>
  );
}
