import type React from "react";
import { ChevronRight } from "lucide-react";
import type { ThemeStyle } from "../models";
import { cn } from "./lib/utils";

export interface CollapsibleProps {
  summary: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  /** `bordered` draws a card-like box; `plain` only the toggle row. */
  variant?: "bordered" | "plain";
  id?: string;
  theme?: ThemeStyle;
  className?: string;
}

/** A disclosure built on native `<details>`: works without JavaScript. */
export function Collapsible({
  summary,
  children,
  defaultOpen,
  variant = "bordered",
  id,
  theme,
  className,
}: CollapsibleProps) {
  const card = theme?.interactives?.card;
  const typography = theme?.typography?.text2;
  return (
    <details
      id={id}
      open={defaultOpen}
      className={cn(
        "group min-w-0",
        variant === "bordered" && [
          "border border-border bg-card text-card-foreground",
          card?.border?.radius ?? "rounded-md",
        ],
        className,
      )}
    >
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center gap-2 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden",
          variant === "bordered" ? "px-3 py-2" : "py-1",
          typography?.fontFamily,
          typography?.fontSize ?? "text-sm",
          typography?.letterSpacing,
        )}
      >
        <ChevronRight
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
        />
        <span className="min-w-0 flex-1">{summary}</span>
      </summary>
      <div
        className={cn(
          variant === "bordered" ? "border-t border-border p-3" : "pl-6 pt-1",
        )}
      >
        {children}
      </div>
    </details>
  );
}
