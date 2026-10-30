"use client";

import React from "react";
import { Check, Copy } from "lucide-react";
import type { ThemeStyle } from "../models";
import { cn } from "./lib/utils";

export interface CodeSnippetProps {
  code: string;
  /** Prefix shown before the first line, e.g. "$". Not copied. */
  prompt?: string;
  theme?: ThemeStyle;
  className?: string;
}

/**
 * A command or short code sample in a bordered monospace box with a copy
 * button — the `curl … | sh` install box of developer-tool landing pages.
 */
export function CodeSnippet({ code, prompt, theme, className }: CodeSnippetProps) {
  const [copied, setCopied] = React.useState(false);
  const typography = theme?.typography?.code;
  const card = theme?.interactives?.card;

  React.useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timeout);
  }, [copied]);

  return (
    <div
      className={cn(
        "flex w-full min-w-0 items-start gap-3 border border-border bg-card text-card-foreground",
        card?.border?.radius ?? "rounded-md",
        className,
      )}
    >
      <pre
        className={cn(
          "min-w-0 flex-1 overflow-x-auto whitespace-pre px-4 py-3 text-left [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]",
          typography?.fontFamily ?? "font-jetbrains-mono",
          typography?.fontSize ?? "text-sm",
          typography?.fontWeight,
          typography?.lineHeight ?? "leading-relaxed",
          typography?.letterSpacing,
        )}
      >
        {prompt && (
          <span className="mr-2 select-none text-muted-foreground" aria-hidden="true">
            {prompt}
          </span>
        )}
        <code>{code}</code>
      </pre>
      <button
        type="button"
        aria-label={copied ? "Copied" : "Copy to clipboard"}
        title={copied ? "Copied" : "Copy"}
        className="m-1.5 inline-flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => {
          void navigator.clipboard?.writeText(code).then(() => setCopied(true));
        }}
      >
        {copied ? (
          <Check className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Copy className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
