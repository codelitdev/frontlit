import React from "react";
import * as Icons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ThemeStyle, WidgetProps } from "../../models";
import type { MarqueeSettings } from "./settings";
import { NavLink } from "../../components/nav-link";
import { Section } from "../../primitives";
import { MarqueeTrack } from "./marquee-track";

function resolveIcon(name?: string): LucideIcon | null {
  if (!name) return null;
  return (Icons as unknown as Record<string, LucideIcon>)[name] ?? null;
}

export function MarqueeWidget({
  settings: {
    items = [],
    direction = "right",
    speed = 60,
    pauseOnHover = true,
    fadeWidth = 50,
    itemBackgroundColor,
    itemForegroundColor,
    itemBorderColor,
    itemBorderRadius = 12,
    itemBorderWidth = 1,
    itemBorderStyle = "solid",
    cssId,
    maxWidth,
    verticalPadding,
    background,
  },
  state: { theme },
}: WidgetProps<MarqueeSettings>) {
  const overriddenTheme: ThemeStyle = JSON.parse(JSON.stringify(theme.theme));
  overriddenTheme.structure.page.width = maxWidth || theme.theme.structure.page.width;
  overriddenTheme.structure.section.padding.y =
    verticalPadding || theme.theme.structure.section.padding.y;

  if (items.length === 0) return null;

  const itemStyle: React.CSSProperties = {
    backgroundColor: itemBackgroundColor || undefined,
    color: itemForegroundColor || undefined,
    borderColor: itemBorderColor || undefined,
    borderRadius: itemBorderRadius,
    borderWidth: itemBorderStyle === "none" ? 0 : itemBorderWidth,
    borderStyle: itemBorderStyle === "none" ? undefined : itemBorderStyle,
  };

  const renderItem = (item: (typeof items)[number]) => {
    const Icon = resolveIcon(item.icon);
    const content = (
      <div
        className="mx-2 flex min-h-[80px] min-w-[160px] items-center justify-center px-6"
        style={itemStyle}
      >
        {Icon ? (
          <Icon className="h-8 w-8" />
        ) : (
          <span className="whitespace-nowrap text-sm font-medium">{item.text}</span>
        )}
      </div>
    );
    return item.href ? (
      <NavLink key={item.id} href={item.href} openInSameTab={false}>
        {content}
      </NavLink>
    ) : (
      <React.Fragment key={item.id}>{content}</React.Fragment>
    );
  };

  return (
    <Section theme={overriddenTheme} id={cssId} background={background}>
      <div className="relative" aria-hidden="true">
        <MarqueeTrack speed={speed} direction={direction} pauseOnHover={pauseOnHover}>
          {items.map(renderItem)}
        </MarqueeTrack>
        {fadeWidth > 0 && (
          <>
            <div
              className="pointer-events-none absolute inset-y-0 left-0 z-10"
              style={{
                width: fadeWidth,
                background: "linear-gradient(to right, var(--background), transparent)",
              }}
            />
            <div
              className="pointer-events-none absolute inset-y-0 right-0 z-10"
              style={{
                width: fadeWidth,
                background: "linear-gradient(to left, var(--background), transparent)",
              }}
            />
          </>
        )}
      </div>
    </Section>
  );
}
