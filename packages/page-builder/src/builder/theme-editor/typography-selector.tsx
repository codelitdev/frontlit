"use client";

import React from "react";
import type { Typography } from "../../models";
import { cn } from "../../primitives/lib/utils";
import { PanelLabel, PanelSelect } from "./ui";
import {
    fontSizeOptions,
    fontWeightOptions,
    lineHeightOptions,
    letterSpacingOptions,
    textTransformOptions,
    fontFamilyOptions,
} from "./tailwind-to-human-readable";

interface TypographySelectorProps {
    value: Typography;
    onChange: (value: Typography) => void;
}

/**
 * Per-role typography editor ported from CourseLit's TypographySelector,
 * using native selects (with `<optgroup>` for font categories) instead of
 * Radix Select.
 */
export function TypographySelector({
    value,
    onChange,
}: TypographySelectorProps) {
    const update = (patch: Partial<Typography>) =>
        onChange({ ...value, ...patch });

    return (
        <div className="space-y-6 p-2">
            <div className="h-[100px] overflow-auto rounded-lg border p-2">
                <div className="flex flex-col space-y-2">
                    <PanelLabel>Preview</PanelLabel>
                    <p
                        className={cn(
                            value?.fontFamily || "",
                            value?.fontSize || "",
                            value?.fontWeight || "",
                            value?.lineHeight || "",
                            value?.letterSpacing || "",
                            value?.textTransform || "normal-case",
                        )}
                    >
                        The quick brown fox jumps over the lazy dog
                    </p>
                </div>
            </div>
            <div className="space-y-6">
                <div className="space-y-1.5">
                    <PanelLabel>Font Family</PanelLabel>
                    <select
                        className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
                        value={value?.fontFamily || ""}
                        onChange={(e) => update({ fontFamily: e.target.value })}
                    >
                        {!value?.fontFamily && (
                            <option value="" disabled>
                                Select font family
                            </option>
                        )}
                        {Object.entries(fontFamilyOptions).map(
                            ([category, fonts]) => (
                                <optgroup key={category} label={category}>
                                    {fonts.map((font) => (
                                        <option
                                            key={font.value}
                                            value={font.value}
                                        >
                                            {font.label}
                                        </option>
                                    ))}
                                </optgroup>
                            ),
                        )}
                    </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <PanelSelect
                        title="Font Size"
                        value={value?.fontSize || ""}
                        onChange={(v) =>
                            update({ fontSize: v as Typography["fontSize"] })
                        }
                        options={fontSizeOptions}
                        placeholder="Select size"
                    />
                    <PanelSelect
                        title="Font Weight"
                        value={value?.fontWeight || ""}
                        onChange={(v) =>
                            update({
                                fontWeight: v as Typography["fontWeight"],
                            })
                        }
                        options={fontWeightOptions}
                        placeholder="Select weight"
                    />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <PanelSelect
                        title="Line Height"
                        value={value?.lineHeight || ""}
                        onChange={(v) =>
                            update({
                                lineHeight: v as Typography["lineHeight"],
                            })
                        }
                        options={lineHeightOptions}
                        placeholder="Select line height"
                    />
                    <PanelSelect
                        title="Letter Spacing"
                        value={value?.letterSpacing || ""}
                        onChange={(v) =>
                            update({
                                letterSpacing: v as Typography["letterSpacing"],
                            })
                        }
                        options={letterSpacingOptions}
                        placeholder="Select spacing"
                    />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <PanelSelect
                        title="Text Transform"
                        value={value?.textTransform || "normal-case"}
                        onChange={(v) =>
                            update({
                                textTransform: v as Typography["textTransform"],
                            })
                        }
                        options={textTransformOptions}
                        placeholder="Select transform"
                    />
                </div>
            </div>
        </div>
    );
}
