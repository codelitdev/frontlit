import React from "react";
import type { ThemeStyle } from "../models";
import { cn } from "./lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  theme?: ThemeStyle;
  error?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = "", theme, error = false, ...props }, ref) => {
    const inputStyles = theme?.interactives?.input;
    const typographyStyles = theme?.typography?.input;
    const classes = cn(
      "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50",
      typographyStyles?.fontFamily,
      typographyStyles?.fontSize,
      typographyStyles?.fontWeight,
      typographyStyles?.lineHeight,
      typographyStyles?.letterSpacing,
      inputStyles?.padding?.x,
      inputStyles?.padding?.y,
      inputStyles?.border?.width,
      inputStyles?.border?.style,
      inputStyles?.border?.radius,
      inputStyles?.shadow,
      props.disabled && inputStyles?.disabled?.opacity,
      props.disabled && inputStyles?.disabled?.cursor,
      error && "border-red-300 focus:border-red-500 focus:ring-red-500",
      inputStyles?.custom,
      className,
    );

    return <textarea ref={ref} className={classes} {...props} />;
  },
);

Textarea.displayName = "Textarea";
