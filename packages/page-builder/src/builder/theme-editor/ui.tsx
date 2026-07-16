"use client";

import React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "../../primitives/lib/utils";
import type { TailwindOption } from "./tailwind-to-human-readable";

/**
 * Shared, dependency-free widgets for the theme editor. These replace the
 * Radix-based Accordion/Select/Label/Input widgets CourseLit's theme editor
 * used from components-library, styled to match its aesthetic.
 */

export function PanelLabel({
    htmlFor,
    children,
}: {
    htmlFor?: string;
    children: React.ReactNode;
}) {
    return (
        <label
            htmlFor={htmlFor}
            className="text-xs font-medium text-foreground"
        >
            {children}
        </label>
    );
}

export function PanelInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
    const { className, ...rest } = props;
    return (
        <input
            {...rest}
            className={cn(
                "h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring",
                className,
            )}
        />
    );
}

export function PanelSelect({
    title,
    value,
    onChange,
    options,
    placeholder = "Select…",
}: {
    title: string;
    value: string;
    onChange: (value: string) => void;
    options: readonly TailwindOption[];
    placeholder?: string;
}) {
    return (
        <div className="space-y-1.5">
            <PanelLabel>{title}</PanelLabel>
            <select
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
                value={value}
                onChange={(e) => onChange(e.target.value)}
            >
                {!value && (
                    <option value="" disabled>
                        {placeholder}
                    </option>
                )}
                {options.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
        </div>
    );
}

/**
 * Collapsible section styled after CourseLit's bordered AccordionItem, built
 * on a native `<details>` element instead of Radix Accordion.
 */
export function AccordionSection({
    title,
    children,
    defaultOpen = false,
}: {
    title: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
}) {
    return (
        <details className="group rounded-md border" open={defaultOpen}>
            <summary className="flex cursor-pointer select-none items-center justify-between rounded-t-md px-2 py-3 text-xs font-semibold transition-colors hover:bg-muted group-open:border-b [&::-webkit-details-marker]:hidden">
                {title}
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="px-2 pb-4 pt-2">{children}</div>
        </details>
    );
}
