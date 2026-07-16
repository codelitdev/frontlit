"use client";

import React from "react";
import { X } from "lucide-react";
import { cn } from "../../primitives/lib/utils";
import { PageBuilderPropertyHeader } from "./page-builder-property-header";

/**
 * Color picker ported from CourseLit's ColorSelector. Uses a native
 * `<input type="color">` swatch paired with a hex text input — no
 * dependencies on a color-picker library.
 */
export function ColorSelector({
    title,
    value,
    onChange,
    tooltip,
    className,
    allowReset = true,
    description,
}: {
    title: string;
    value: string;
    onChange: (value?: string) => void;
    tooltip?: string;
    className?: string;
    allowReset?: boolean;
    description?: string;
}) {
    const [localValue, setLocalValue] = React.useState(value);

    React.useEffect(() => {
        setLocalValue(value);
    }, [value]);

    const handleChange = (newValue: string) => {
        setLocalValue(newValue);
        onChange(newValue);
    };

    // Native color inputs only accept #rrggbb; fall back to black otherwise.
    const swatchValue = /^#[0-9a-fA-F]{6}$/.test(localValue)
        ? localValue
        : "#000000";

    return (
        <div
            className={cn(
                "flex min-w-0 items-center justify-between gap-2",
                className,
            )}
        >
            <div className="flex min-w-0 flex-1 flex-col gap-1">
                <PageBuilderPropertyHeader label={title} tooltip={tooltip} />
                {description && (
                    <p className="break-words text-xs text-muted-foreground">
                        {description}
                    </p>
                )}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
                <input
                    type="color"
                    value={swatchValue}
                    onChange={(e) => handleChange(e.currentTarget.value)}
                    className="h-7 w-9 shrink-0 cursor-pointer rounded-md border border-input bg-background p-0.5"
                    aria-label={`${title} swatch`}
                />
                <input
                    type="text"
                    value={localValue ?? ""}
                    placeholder="#000000"
                    onChange={(e) => handleChange(e.currentTarget.value)}
                    className="h-7 w-20 min-w-0 rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring/20"
                    aria-label={`${title} hex value`}
                />
                {allowReset && (
                    <button
                        type="button"
                        title="Reset"
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md hover:bg-muted/50"
                        onClick={(e) => {
                            e.preventDefault();
                            setLocalValue("");
                            onChange();
                        }}
                    >
                        <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                    </button>
                )}
            </div>
        </div>
    );
}
