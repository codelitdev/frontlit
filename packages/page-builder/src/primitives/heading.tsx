import type React from "react";
import type { ThemeStyle, Typography } from "../models";
import { cn } from "./lib/utils";
import type { TypographyProps } from "./typography";

export type HeadingTag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span" | "div";

export interface HeadingProps extends TypographyProps {
  /** Element to render. Lets a block pick its heading level independently of its look. */
  as?: HeadingTag;
  /**
   * Font-size classes that override the theme size. Kept apart from
   * `className` so they are merged before the theme's line-height, which
   * tailwind-merge would otherwise drop.
   */
  sizeClassName?: string;
}

// Phone and desktop widths the fluid size interpolates between.
const FLUID_MIN_VIEWPORT = 360;
const FLUID_MAX_VIEWPORT = 1280;

/** px size of each Tailwind text size class. */
export const TAILWIND_TEXT_PX: Record<string, number> = {
  "text-xs": 12,
  "text-sm": 14,
  "text-base": 16,
  "text-lg": 18,
  "text-xl": 20,
  "text-2xl": 24,
  "text-3xl": 30,
  "text-4xl": 36,
  "text-5xl": 48,
  "text-6xl": 60,
  "text-7xl": 72,
  "text-8xl": 96,
  "text-9xl": 128,
};

const rem = (px: number) => `${+(px / 16).toFixed(4)}rem`;

/** CSS `clamp()` growing from `min` px on a phone to `max` px on a desktop. */
export function fluidFontSize({ min, max }: { min: number; max: number }): string {
  const slope = (max - min) / (FLUID_MAX_VIEWPORT - FLUID_MIN_VIEWPORT);
  const intercept = min - slope * FLUID_MIN_VIEWPORT;
  return `clamp(${rem(Math.min(min, max))}, ${rem(intercept)} + ${+(slope * 100).toFixed(4)}vw, ${rem(Math.max(min, max))})`;
}

/**
 * The theme's size for a level as a CSS value, exposed as `--pb-theme-size`
 * so a block's per-breakpoint overrides can fall back to it.
 */
function themeSize(typography?: Typography): string | undefined {
  if (typography?.fluid) return fluidFontSize(typography.fluid);
  const px = TAILWIND_TEXT_PX[typography?.fontSize ?? ""];
  return px ? rem(px) : undefined;
}

export function createHeading(
  displayName: string,
  defaultTag: HeadingTag,
  baseClasses: string,
  getTypography: (theme?: ThemeStyle) => Typography | undefined,
): React.FC<HeadingProps> {
  const Heading: React.FC<HeadingProps> = ({
    children,
    className = "",
    theme,
    as: Tag = defaultTag,
    sizeClassName,
    style,
    ...props
  }) => {
    const typography = getTypography(theme);
    const fluid = typography?.fluid;
    const classes = cn(
      baseClasses,
      typography?.fontSize,
      // A class (not an inline font-size) so `sizeClassName` still wins.
      fluid && "text-[length:var(--pb-theme-size)]",
      sizeClassName,
      typography?.fontFamily,
      typography?.fontWeight,
      typography?.lineHeight,
      typography?.letterSpacing,
      typography?.textTransform,
      typography?.textDecoration,
      typography?.textOverflow,
      className,
    );

    return (
      <Tag
        className={classes}
        style={
          { "--pb-theme-size": themeSize(typography), ...style } as React.CSSProperties
        }
        {...props}
      >
        {children}
      </Tag>
    );
  };
  Heading.displayName = displayName;
  return Heading;
}
