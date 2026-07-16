"use client";

import React from "react";
import type { ThemeStyle } from "../../models";
import { PageBuilderSlider } from "./page-builder-slider";

type PageWidth = ThemeStyle["structure"]["page"]["width"];

// Map of numeric values to Tailwind max-width classes
const MAX_WIDTH_MAP: Record<number, PageWidth> = {
    1: "max-w-2xl",
    2: "max-w-3xl",
    3: "max-w-4xl",
    4: "max-w-5xl",
    5: "max-w-6xl",
};

export function getMaxWidthTWClass(value: number): PageWidth {
    const roundedValue = Math.max(1, Math.min(5, Math.round(value)));
    return MAX_WIDTH_MAP[roundedValue] || MAX_WIDTH_MAP[5];
}

interface MaxWidthSelectorProps {
    value?: PageWidth;
    onChange: (width?: PageWidth) => void;
    className?: string;
    /**
     * The value actually applied when `value` is unset — the active
     * theme's own page width. Without this the slider could display a
     * width that doesn't match what's really rendered.
     */
    themeDefault?: PageWidth;
}

export function MaxWidthSelector({
    value,
    onChange,
    className = "",
    themeDefault,
}: MaxWidthSelectorProps) {
    // Find the numeric value from the current Tailwind class, falling back
    // to the theme's own default (what's actually rendered) rather than a
    // hardcoded guess.
    const numericValue =
        Object.entries(MAX_WIDTH_MAP).find(
            ([_, v]) => v === (value ?? themeDefault),
        )?.[0] || "5";

    const handleChange = (newValue?: number) => {
        if (newValue === undefined) {
            onChange();
            return;
        }
        onChange(getMaxWidthTWClass(newValue));
    };

    return (
        <PageBuilderSlider
            title="Maximum width"
            max={5}
            min={1}
            onChange={handleChange}
            value={parseInt(numericValue)}
            tooltip="Maximum width of the content"
            className={className}
            allowsReset={true}
            unit=""
        />
    );
}
