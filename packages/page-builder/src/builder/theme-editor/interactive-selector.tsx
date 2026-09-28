"use client";

import React from "react";
import { Info } from "lucide-react";
import type { Border, Padding, Shadow, ThemeStyle } from "../../models";
import {
  Button,
  PageCard,
  PageCardContent,
  PageCardHeader,
  Input as PageInput,
  Link as PageLink,
} from "../../primitives";
import { AccordionSection, PanelInput, PanelLabel, PanelSelect } from "./ui";
import {
  paddingOptions,
  borderWidthOptions,
  borderStyleOptions,
  borderRadiusOptions,
  shadowOptions,
} from "./tailwind-to-human-readable";

export type InteractiveType = "button" | "link" | "card" | "input";

export const interactiveDisplayNames: Record<string, string> = {
  button: "Button",
  link: "Link",
  card: "Card",
  input: "Input",
} as const;

interface InteractiveSelectorProps {
  type: InteractiveType;
  theme: ThemeStyle;
  onChange: (theme: ThemeStyle) => void;
}

/**
 * Button/link/card/input style editor ported from CourseLit's
 * InteractiveSelector, with native accordions/selects instead of Radix.
 */
export function InteractiveSelector({
  type,
  theme,
  onChange,
}: InteractiveSelectorProps) {
  const value = theme.interactives[type] as {
    padding?: Padding;
    border?: Border;
    shadow?: Shadow;
    textShadow?: string;
    custom?: string;
  };

  const updateInteractive = (patch: Record<string, unknown>) => {
    onChange({
      ...theme,
      interactives: {
        ...theme.interactives,
        [type]: {
          ...value,
          ...patch,
        },
      },
    });
  };

  const renderDemo = () => {
    switch (type) {
      case "button":
        return <Button theme={theme}>Preview</Button>;
      case "link":
        return <PageLink theme={theme}>Demo Link</PageLink>;
      case "card":
        return (
          <PageCard theme={theme}>
            <PageCardContent theme={theme}>
              <PageCardHeader theme={theme}>Card Title</PageCardHeader>
              <div>Card content goes here</div>
            </PageCardContent>
          </PageCard>
        );
      case "input":
        return <PageInput theme={theme} type="text" placeholder="Demo Input" />;
      default:
        return null;
    }
  };

  const renderPaddingConfig = (
    allowedPaddingX?: string[],
    allowedPaddingY?: string[],
  ) => {
    const filteredPaddingX = allowedPaddingX
      ? paddingOptions.x.filter((option) => allowedPaddingX.includes(option.value))
      : paddingOptions.x;
    const filteredPaddingY = allowedPaddingY
      ? paddingOptions.y.filter((option) => allowedPaddingY.includes(option.value))
      : paddingOptions.y;

    return (
      <AccordionSection title="Padding">
        <div className="grid grid-cols-2 gap-4">
          <PanelSelect
            title="Padding X"
            value={value?.padding?.x || ""}
            onChange={(newValue) =>
              updateInteractive({
                padding: {
                  ...value?.padding,
                  x: newValue as Padding["x"],
                },
              })
            }
            options={filteredPaddingX}
            placeholder="Select padding"
          />
          <PanelSelect
            title="Padding Y"
            value={value?.padding?.y || ""}
            onChange={(newValue) =>
              updateInteractive({
                padding: {
                  ...value?.padding,
                  y: newValue as Padding["y"],
                },
              })
            }
            options={filteredPaddingY}
            placeholder="Select padding"
          />
        </div>
      </AccordionSection>
    );
  };

  const renderBorderConfig = () => (
    <AccordionSection title="Border">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <PanelSelect
            title="Border Radius"
            value={value?.border?.radius || ""}
            onChange={(newValue) =>
              updateInteractive({
                border: {
                  ...value?.border,
                  radius: newValue as Border["radius"],
                },
              })
            }
            options={borderRadiusOptions}
            placeholder="Select radius"
          />
          <PanelSelect
            title="Border Style"
            value={value?.border?.style || ""}
            onChange={(newValue) =>
              updateInteractive({
                border: {
                  ...value?.border,
                  style: newValue as Border["style"],
                },
              })
            }
            options={borderStyleOptions}
            placeholder="Select style"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <PanelSelect
            title="Border Width"
            value={value?.border?.width || ""}
            onChange={(newValue) =>
              updateInteractive({
                border: {
                  ...value?.border,
                  width: newValue as Border["width"],
                },
              })
            }
            options={borderWidthOptions}
            placeholder="Select width"
          />
        </div>
      </div>
    </AccordionSection>
  );

  const renderBoxShadowConfig = () => {
    if (type === "link") {
      return null;
    }
    return (
      <AccordionSection title="Shadow">
        <PanelSelect
          title="Shadow"
          value={value?.shadow || ""}
          onChange={(newValue) => updateInteractive({ shadow: newValue as Shadow })}
          options={shadowOptions}
          placeholder="Select shadow"
        />
      </AccordionSection>
    );
  };

  const renderTextShadowConfig = () => {
    if (type !== "link") {
      return null;
    }
    return (
      <AccordionSection title="Text Shadow">
        <div className="space-y-1.5">
          <PanelLabel>Text Shadow</PanelLabel>
          <PanelInput
            value={value?.textShadow || ""}
            placeholder="0px 0px 0px 0px rgba(0, 0, 0, 0.1)"
            onChange={(e) => updateInteractive({ textShadow: e.target.value })}
          />
        </div>
      </AccordionSection>
    );
  };

  const renderCustomClassesConfig = () => (
    <AccordionSection title="Advanced">
      <div className="space-y-2">
        <PanelLabel>Custom classes</PanelLabel>
        <PanelInput
          value={value?.custom || ""}
          onChange={(e) => updateInteractive({ custom: e.target.value })}
          placeholder="Enter Tailwind classes"
        />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Info className="h-4 w-4 shrink-0" />
          <span>Use any supported Tailwind class here.</span>
        </div>
      </div>
    </AccordionSection>
  );

  const renderConfig = () => {
    switch (type) {
      case "button":
      case "input":
        return (
          <>
            {renderPaddingConfig(
              ["px-0", "px-4", "px-6", "px-8", "px-10"],
              ["py-0", "py-4", "py-6", "py-8", "py-10"],
            )}
            {renderBorderConfig()}
            {renderBoxShadowConfig()}
            {renderCustomClassesConfig()}
          </>
        );
      case "link":
        return (
          <>
            {renderTextShadowConfig()}
            {renderCustomClassesConfig()}
          </>
        );
      case "card":
        return (
          <>
            {renderPaddingConfig([
              "px-0",
              "px-4",
              "px-6",
              "px-8",
              "px-10",
              "px-12",
              "px-16",
              "px-20",
              "px-24",
              "px-32",
            ])}
            {renderBorderConfig()}
            {renderBoxShadowConfig()}
            {renderCustomClassesConfig()}
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 p-2">
      <div className="min-h-[100px] overflow-auto rounded-lg border p-2">
        <div className="flex flex-col space-y-2">
          <PanelLabel>Preview</PanelLabel>
          {renderDemo()}
        </div>
      </div>
      <div className="space-y-4">{renderConfig()}</div>
    </div>
  );
}
