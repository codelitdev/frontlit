import type React from "react";
import type { ThemeStyle } from "../models";
import { cn } from "./lib/utils";

export interface InlineCodeProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
  theme?: ThemeStyle;
  /** `muted` drops the background, for secondary details like types. */
  variant?: "default" | "muted";
}

/** Code inside running text: identifiers, paths, field names and values. */
export function InlineCode({
  children,
  theme,
  variant = "default",
  className,
  ...props
}: InlineCodeProps) {
  const typography = theme?.typography?.code;
  return (
    <code
      className={cn(
        // Code is literal: never inherit a theme's uppercase captions.
        "break-words normal-case",
        typography?.fontFamily ?? "font-jetbrains-mono",
        // Relative to the surrounding text; the theme's code size is for blocks.
        "text-[0.875em]",
        typography?.letterSpacing,
        variant === "default"
          ? "rounded bg-muted px-1 py-0.5 text-foreground"
          : "text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </code>
  );
}
