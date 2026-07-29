"use client";

import React, { useId } from "react";
import { Plus } from "lucide-react";
import { cn } from "../../primitives/lib/utils";

/**
 * Lightweight, dependency-free form field primitives shared by every block's
 * settings editor. These intentionally stay simple (no media library, no
 * rich color pickers) so the page-builder package works without a backend.
 */

export function FieldGroup({
    title,
    children,
}: {
    title?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="mb-6 flex min-w-0 max-w-full flex-col gap-4 border-b border-border/80 pb-6 last:mb-0 last:border-0 last:pb-0">
            {title && (
                <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                        {title}
                    </p>
                </div>
            )}
            {children}
        </div>
    );
}

export function TextField({
    label,
    value,
    onChange,
    placeholder,
    multiline,
}: {
    label: string;
    value?: string;
    onChange: (value: string) => void;
    placeholder?: string;
    multiline?: boolean;
}) {
    const generatedId = useId();
    const inputId = `field-${generatedId.replace(/:/g, "")}`;

    return (
        <label htmlFor={inputId} className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs font-semibold text-foreground">
                {label}
            </span>
            {multiline ? (
                <textarea
                    id={inputId}
                    className="min-h-24 resize-y rounded-lg border border-input bg-muted/20 px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/20"
                    value={value ?? ""}
                    placeholder={placeholder}
                    onChange={(e) => onChange(e.target.value)}
                />
            ) : (
                <input
                    id={inputId}
                    className="h-9 rounded-lg border border-input bg-muted/20 px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/20"
                    value={value ?? ""}
                    placeholder={placeholder}
                    onChange={(e) => onChange(e.target.value)}
                />
            )}
        </label>
    );
}

export function NumberField({
    label,
    value,
    onChange,
    min,
    max,
}: {
    label: string;
    value?: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
}) {
    const generatedId = useId();
    const inputId = `field-${generatedId.replace(/:/g, "")}`;

    return (
        <label htmlFor={inputId} className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs font-semibold text-foreground">
                {label}
            </span>
            <input
                id={inputId}
                type="number"
                className="h-9 rounded-lg border border-input bg-muted/20 px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/20"
                value={value ?? ""}
                min={min}
                max={max}
                onChange={(e) => onChange(Number(e.target.value))}
            />
        </label>
    );
}

export function SelectField<T extends string>({
    label,
    value,
    onChange,
    options,
}: {
    label: string;
    value?: T;
    onChange: (value: T) => void;
    options: { label: string; value: T }[];
}) {
    const generatedId = useId();
    const inputId = `field-${generatedId.replace(/:/g, "")}`;

    return (
        <label htmlFor={inputId} className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs font-semibold text-foreground">
                {label}
            </span>
            <select
                id={inputId}
                className="h-9 w-full rounded-lg border border-input bg-muted/20 px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/20"
                value={value ?? ""}
                onChange={(e) => onChange(e.target.value as T)}
            >
                {options.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
        </label>
    );
}

export function ToggleField({
    label,
    value,
    onChange,
}: {
    label: string;
    value?: boolean;
    onChange: (value: boolean) => void;
}) {
    return (
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border/80 bg-muted/20 px-3 py-2.5 text-sm transition-colors hover:bg-muted/50">
            <span className="text-xs font-semibold text-foreground">
                {label}
            </span>
            <input
                type="checkbox"
                className="peer sr-only"
                checked={Boolean(value)}
                onChange={(e) => onChange(e.target.checked)}
            />
            <span
                aria-hidden="true"
                className={cn(
                    "relative h-5 w-9 shrink-0 rounded-full bg-muted-foreground/25 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-background after:shadow-sm after:transition-transform peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2",
                    value && "bg-primary after:translate-x-4",
                )}
            />
        </label>
    );
}

export function ListField<T>({
    label,
    items,
    onChange,
    renderItem,
    createItem,
    addLabel = "Add item",
}: {
    label: string;
    items: T[];
    onChange: (items: T[]) => void;
    renderItem: (
        item: T,
        update: (next: Partial<T>) => void,
        remove: () => void,
        index: number,
    ) => React.ReactNode;
    createItem: () => T;
    addLabel?: string;
}) {
    return (
        <div className="flex flex-col gap-2.5 text-sm">
            <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-foreground">
                    {label}
                </span>
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {items.length} {items.length === 1 ? "item" : "items"}
                </span>
            </div>
            <div className="flex flex-col gap-2.5">
                {items.map((item, index) => (
                    <div
                        key={index}
                        className="flex flex-col gap-3 rounded-xl border border-border/80 bg-muted/15 p-3.5 [&>button]:self-end [&>button]:rounded-md [&>button]:px-2 [&>button]:py-1 [&>button]:text-[11px] [&>button]:font-semibold [&>button]:transition-colors [&>button]:hover:bg-destructive/10"
                    >
                        <div className="flex items-center justify-between border-b border-border/60 pb-2">
                            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                                Item {String(index + 1).padStart(2, "0")}
                            </span>
                        </div>
                        {renderItem(
                            item,
                            (next) => {
                                const copy = items.slice();
                                copy[index] = { ...item, ...next };
                                onChange(copy);
                            },
                            () => {
                                onChange(items.filter((_, i) => i !== index));
                            },
                            index,
                        )}
                    </div>
                ))}
            </div>
            <button
                type="button"
                className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-input text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-foreground"
                onClick={() => onChange([...items, createItem()])}
            >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                {addLabel}
            </button>
        </div>
    );
}
