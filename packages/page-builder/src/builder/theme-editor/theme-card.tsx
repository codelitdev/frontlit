"use client";

import React from "react";
import { Check, Pencil } from "lucide-react";
import { cn } from "../../primitives/lib/utils";

function CardButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background shadow-sm transition-colors",
        disabled ? "cursor-not-allowed opacity-60" : "hover:bg-muted",
      )}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      {children}
    </button>
  );
}

/**
 * Theme card ported from CourseLit's ThemeCard: theme name and actions on
 * top, a row of palette swatches below. Clicking the card previews the
 * theme on the canvas without applying it. The pencil opens the theme for
 * editing (copying it first when it's a system theme); the check applies
 * the theme to the page.
 */
export function ThemeCard({
  name,
  palette,
  selected = false,
  active = false,
  onPreview,
  onUse,
  onEdit,
  className,
}: {
  name: string;
  palette: string[];
  /** Whether this theme is currently painted on the canvas (preview). */
  selected?: boolean;
  /** Whether this theme is the one actually applied to the site. */
  active?: boolean;
  onPreview?: () => void;
  onUse?: () => void;
  onEdit?: () => void;
  className?: string;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`Preview ${name}`}
      className={cn(
        "flex w-full cursor-pointer flex-col gap-2 rounded-lg bg-background p-2 text-left transition-colors",
        selected
          ? "border-2 border-primary shadow-md"
          : "border border-muted shadow-none hover:bg-muted",
        className,
      )}
      onClick={onPreview}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onPreview?.();
        }
      }}
    >
      <div className="flex min-h-[32px] items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold text-foreground">{name}</span>
        <div className="flex shrink-0 items-center gap-1">
          {onEdit && (
            <CardButton label={`Edit ${name}`} onClick={onEdit}>
              <Pencil className="h-4 w-4" />
            </CardButton>
          )}
          {onUse && (
            <CardButton label={`Use ${name}`} disabled={active} onClick={onUse}>
              <Check className="h-4 w-4" />
            </CardButton>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        {palette.map((color, i) => (
          <span
            key={i}
            className="h-4 w-4 rounded-full border"
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    </div>
  );
}
