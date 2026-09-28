"use client";

import React from "react";
import type { ThemeStyle } from "../../models";
import { MaxWidthSelector, VerticalPaddingSelector } from "../controls";
import { PanelSelect } from "./ui";
import { paddingOptions } from "./tailwind-to-human-readable";

export const structureDisplayNames: Record<string, string> = {
  page: "Page",
  section: "Section",
} as const;

interface StructureSelectorProps {
  type: "page" | "section";
  theme: ThemeStyle;
  onChange: (theme: ThemeStyle) => void;
}

type SectionPadding = ThemeStyle["structure"]["section"]["padding"];

/**
 * Page width / section padding editor ported from CourseLit's
 * StructureSelector, reusing FrontLit's slider-based width/padding controls.
 */
export function StructureSelector({ type, theme, onChange }: StructureSelectorProps) {
  if (type === "page") {
    const pageValue = theme.structure.page;
    return (
      <div className="space-y-6 p-2">
        <MaxWidthSelector
          value={pageValue?.width}
          onChange={(width) => {
            if (!width) return;
            onChange({
              ...theme,
              structure: {
                ...theme.structure,
                page: { width },
              },
            });
          }}
        />
      </div>
    );
  }

  const sectionValue = theme.structure.section;
  const updatePadding = (patch: Partial<SectionPadding>) => {
    onChange({
      ...theme,
      structure: {
        ...theme.structure,
        section: {
          ...sectionValue,
          padding: {
            ...sectionValue?.padding,
            ...patch,
          },
        },
      },
    });
  };

  return (
    <div className="space-y-6 p-2">
      <PanelSelect
        title="Horizontal Padding"
        value={sectionValue?.padding?.x || ""}
        onChange={(x) => updatePadding({ x: x as SectionPadding["x"] })}
        options={paddingOptions.x}
        placeholder="Select padding"
      />
      <VerticalPaddingSelector
        value={sectionValue?.padding?.y}
        onChange={(y) => {
          if (!y) return;
          updatePadding({ y });
        }}
      />
    </div>
  );
}
