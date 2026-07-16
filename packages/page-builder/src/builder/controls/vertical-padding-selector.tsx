"use client";

import React from "react";
import type { ThemeStyle } from "../../models";
import { PageBuilderSlider } from "./page-builder-slider";

type VerticalPadding = ThemeStyle["structure"]["section"]["padding"]["y"];

// Map of numeric values to Tailwind padding classes
const PADDING_MAP: Record<number, VerticalPadding> = {
    0: "py-0",
    1: "py-4",
    2: "py-6",
    3: "py-8",
    4: "py-10",
    5: "py-12",
    6: "py-16",
    7: "py-20",
    8: "py-24",
    9: "py-32",
    10: "py-40",
    11: "py-48",
    12: "py-56",
    13: "py-64",
};

export function getVerticalPaddingTWClass(value: number): VerticalPadding {
    const roundedValue = Math.max(0, Math.min(13, Math.round(value)));
    return PADDING_MAP[roundedValue] || PADDING_MAP[5];
}

interface VerticalPaddingSelectorProps {
    value?: VerticalPadding;
    onChange: (padding?: VerticalPadding) => void;
    className?: string;
    /**
     * The value actually applied when `value` is unset — the active
     * theme's own section padding. Without this the slider would default
     * to displaying 0 regardless of the real (usually much larger) padding
     * in effect, misleading the user into thinking nothing is applied.
     */
    themeDefault?: VerticalPadding;
}

export function VerticalPaddingSelector({
    value,
    onChange,
    className = "",
    themeDefault,
}: VerticalPaddingSelectorProps) {
    // Find the numeric value from the current Tailwind class, falling back
    // to the theme's own default (what's actually rendered) rather than 0.
    const numericValue =
        Object.entries(PADDING_MAP).find(
            ([_, v]) => v === (value ?? themeDefault),
        )?.[0] || "6";

    const handleChange = (newValue?: number) => {
        if (newValue === undefined) {
            onChange();
            return;
        }
        onChange(getVerticalPaddingTWClass(newValue));
    };

    return (
        <PageBuilderSlider
            title="Vertical padding"
            max={13}
            min={0}
            onChange={handleChange}
            value={parseInt(numericValue)}
            tooltip="Vertical padding of the section"
            className={className}
            unit=""
        />
    );
}
