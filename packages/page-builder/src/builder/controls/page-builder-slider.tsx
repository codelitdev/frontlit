"use client";

import React from "react";
import { X } from "lucide-react";
import { cn } from "../../primitives/lib/utils";
import { PageBuilderPropertyHeader } from "./page-builder-property-header";

/**
 * Slider with a paired numeric input, ported from CourseLit's
 * PageBuilderSlider. Uses a native range input instead of Radix Slider so it
 * adds no dependencies.
 */
export function PageBuilderSlider({
    title,
    min,
    max,
    value,
    onChange,
    tooltip,
    className,
    allowsReset = false,
    unit = "px",
}: {
    title: string;
    min: number;
    max: number;
    value: number;
    onChange: (value?: number) => void;
    tooltip?: string;
    className?: string;
    allowsReset?: boolean;
    unit?: string;
}) {
    return (
        <div className={cn("flex flex-col gap-2.5", className)}>
            <div className="flex items-center justify-between gap-3">
                <PageBuilderPropertyHeader label={title} tooltip={tooltip} />
                <div className="flex items-center gap-1.5">
                    <input
                        type="number"
                        inputMode="numeric"
                        min={min}
                        max={max}
                        value={Number.isFinite(value) ? value : 0}
                        onChange={(e) => {
                            const parsed = Number(e.currentTarget.value);
                            if (Number.isNaN(parsed)) return;
                            onChange(Math.min(Math.max(parsed, min), max));
                        }}
                        className="h-7 w-12 rounded-md border border-input bg-muted/20 px-1.5 py-1 text-center text-xs font-semibold text-foreground outline-none transition-colors focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/20"
                    />
                    {unit && (
                        <span className="text-[10px] font-medium text-muted-foreground">
                            {unit}
                        </span>
                    )}
                    {allowsReset && (
                        <button
                            type="button"
                            title="Reset"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={(e) => {
                                e.preventDefault();
                                onChange();
                            }}
                        >
                            <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                        </button>
                    )}
                </div>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={1}
                value={Number.isFinite(value) ? value : min}
                onChange={(e) => onChange(Number(e.currentTarget.value))}
                aria-label={title}
                className="h-1.5 w-full cursor-pointer accent-primary"
            />
        </div>
    );
}
