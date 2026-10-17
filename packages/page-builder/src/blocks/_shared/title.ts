import React from "react";
import type { HeadingLevel, ResponsiveTextSize, ThemeStyle } from "../../models";
import { cn } from "../../primitives/lib/utils";

/**
 * Props for a block title: its heading element plus the block's own size
 * overrides. Tablet and desktop use the `md` and `lg` breakpoints; a
 * breakpoint without an override keeps the theme size, read from the
 * heading's `--pb-theme-size`.
 */
export function titleProps(
  {
    titleLevel,
    titleSize,
  }: { titleLevel?: HeadingLevel; titleSize?: ResponsiveTextSize },
  defaultLevel: HeadingLevel = "h2",
  /** The block's own default size, e.g. a compact layout's `text-xl`. */
  baseSizeClassName?: string,
): {
  as: HeadingLevel;
  sizeClassName: string;
  style: React.CSSProperties;
} {
  const { mobile, tablet, desktop } = titleSize ?? {};
  const size = (value?: number) => (value ? `${value}px` : "var(--pb-theme-size, 1em)");
  return {
    as: titleLevel ?? defaultLevel,
    sizeClassName: cn(
      baseSizeClassName,
      mobile && "text-[length:var(--pb-title-mobile)]",
      (mobile || tablet) && "md:text-[length:var(--pb-title-tablet)]",
      (tablet || desktop) && "lg:text-[length:var(--pb-title-desktop)]",
    ),
    style: {
      "--pb-title-mobile": mobile ? size(mobile) : undefined,
      "--pb-title-tablet": mobile || tablet ? size(tablet) : undefined,
      "--pb-title-desktop": tablet || desktop ? size(desktop) : undefined,
    } as React.CSSProperties,
  };
}

const HIGHLIGHT_CLASSES = {
  color: "text-primary",
  marker: "bg-primary px-[0.15em] text-primary-foreground [box-decoration-break:clone]",
};

/**
 * Renders a block title, making words wrapped in `*asterisks*` stand out
 * in the theme's highlight style, e.g. "Run them *anywhere*".
 */
export function renderTitle(title?: string, theme?: ThemeStyle): React.ReactNode {
  if (!title?.includes("*")) return title;
  const className = HIGHLIGHT_CLASSES[theme?.highlight ?? "color"];
  return title
    .split(/(\*[^*]+\*)/)
    .map((part, index) =>
      /^\*[^*]+\*$/.test(part)
        ? React.createElement("span", { key: index, className }, part.slice(1, -1))
        : part,
    );
}
