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
 * top, a row of palette swatches below. The pencil opens the theme for
 * editing (copying it first when it's a system theme); the check applies
 * the theme to the page.
 */
export function ThemeCard({
    name,
    palette,
    selected = false,
    onUse,
    onEdit,
    className,
}: {
    name: string;
    palette: string[];
    /** Whether this theme is the one currently applied to the page. */
    selected?: boolean;
    onUse?: () => void;
    onEdit?: () => void;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "flex w-full flex-col gap-2 rounded-lg bg-background p-2 transition-colors",
                selected
                    ? "border-2 border-primary shadow-md"
                    : "border border-muted shadow-none",
                className,
            )}
        >
            <div className="flex min-h-[32px] items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold text-foreground">
                    {name}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                    {onEdit && (
                        <CardButton label={`Edit ${name}`} onClick={onEdit}>
                            <Pencil className="h-4 w-4" />
                        </CardButton>
                    )}
                    {onUse && (
                        <CardButton
                            label={`Use ${name}`}
                            disabled={selected}
                            onClick={onUse}
                        >
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
