"use client";

import React from "react";
import type { Typography } from "../../models";
import { cn } from "../../primitives/lib/utils";
import { fluidFontSize, TAILWIND_TEXT_PX } from "../../primitives/heading";
import { PanelInput, PanelLabel, PanelSelect } from "./ui";
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
  /** Offer a size that scales from phone to desktop. */
  allowFluid?: boolean;
}

/** Starting range when scaling is switched on: the fixed size on desktop, ~⅔ of it on a phone. */
function defaultFluid(fontSize?: string) {
  const max = TAILWIND_TEXT_PX[fontSize ?? ""] ?? 48;
  return { min: Math.round(max * 0.66), max };
}

/**
 * Per-role typography editor ported from CourseLit's TypographySelector,
 * using native selects (with `<optgroup>` for font categories) instead of
 * Radix Select.
 */
export function TypographySelector({
  value,
  onChange,
  allowFluid,
}: TypographySelectorProps) {
  const update = (patch: Partial<Typography>) => onChange({ ...value, ...patch });
  const fluid = value?.fluid;

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
            style={fluid ? { fontSize: fluidFontSize(fluid) } : undefined}
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
            {Object.entries(fontFamilyOptions).map(([category, fonts]) => (
              <optgroup key={category} label={category}>
                {fonts.map((font) => (
                  <option key={font.value} value={font.value}>
                    {font.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        {allowFluid && (
          <div className="space-y-3 rounded-md border p-2">
            <label className="flex items-center justify-between gap-3 text-xs font-medium text-foreground">
              Scale with screen size
              <input
                type="checkbox"
                checked={Boolean(fluid)}
                onChange={(e) =>
                  update({
                    fluid: e.target.checked ? defaultFluid(value.fontSize) : undefined,
                  })
                }
              />
            </label>
            {fluid && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <PanelLabel htmlFor="fluid-min">Phone size (px)</PanelLabel>
                  <PanelInput
                    id="fluid-min"
                    type="number"
                    min={8}
                    max={200}
                    value={fluid.min}
                    onChange={(e) =>
                      update({ fluid: { ...fluid, min: Number(e.target.value) || 0 } })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <PanelLabel htmlFor="fluid-max">Desktop size (px)</PanelLabel>
                  <PanelInput
                    id="fluid-max"
                    type="number"
                    min={8}
                    max={200}
                    value={fluid.max}
                    onChange={(e) =>
                      update({ fluid: { ...fluid, max: Number(e.target.value) || 0 } })
                    }
                  />
                </div>
              </div>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <PanelSelect
            title={fluid ? "Font Size (unused while scaling)" : "Font Size"}
            value={value?.fontSize || ""}
            onChange={(v) => update({ fontSize: v as Typography["fontSize"] })}
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
