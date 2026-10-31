import React from "react";
import type { ThemeStyle } from "../models";
import { cn } from "./lib/utils";

export interface NativeSelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  theme?: ThemeStyle;
}

/**
 * A themed native `<select>`. Use it where a page must stay light (it ships
 * no JavaScript); `Select` is the richer Radix-based control.
 */
export const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, theme, children, ...props }, ref) => {
    const input = theme?.interactives?.input;
    const typography = theme?.typography?.input;
    return (
      <select
        ref={ref}
        className={cn(
          "flex min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base leading-normal text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          typography?.fontFamily,
          typography?.fontSize,
          typography?.fontWeight,
          typography?.letterSpacing,
          input?.padding?.x,
          input?.padding?.y,
          input?.border?.width,
          input?.border?.style,
          input?.border?.radius,
          input?.shadow,
          input?.custom,
          className,
        )}
        {...props}
      >
        {children}
      </select>
    );
  },
);
NativeSelect.displayName = "NativeSelect";
