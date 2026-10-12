import React from "react";
import { LockKeyhole } from "lucide-react";
import type { ThemeStyle, WidgetDefaultSettings, WidgetProps } from "../../models";
import { Section } from "../../primitives";

export interface DataSlotSettings extends WidgetDefaultSettings {
  /** Name matched against the host application's data-slot loaders. */
  slot: string;
}

/**
 * A reserved, host-resolved data region. The host passes its rendered result
 * through `PageRenderer`; the builder shows a generic placeholder instead.
 * Live content uses the same `Section` shell as other blocks so it shares
 * the theme's page width instead of shrink-wrapping to the feed's copy.
 */
export function DataSlotWidget({
  data,
  editing,
  settings: { slot, cssId, maxWidth, verticalPadding, background },
  state: { theme },
  nextTheme,
}: WidgetProps<DataSlotSettings>) {
  const overriddenTheme: ThemeStyle = JSON.parse(JSON.stringify(theme.theme));
  overriddenTheme.structure.page.width = maxWidth || theme.theme.structure.page.width;
  overriddenTheme.structure.section.padding.y =
    verticalPadding || theme.theme.structure.section.padding.y;

  if (data !== undefined) {
    return (
      <Section
        theme={overriddenTheme}
        id={cssId}
        background={background}
        nextTheme={nextTheme}
      >
        {data}
      </Section>
    );
  }
  if (!editing) return null;

  return (
    <Section
      theme={overriddenTheme}
      id={cssId}
      background={background}
      nextTheme={nextTheme}
      className="border-y border-dashed border-border bg-muted/30"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
          <LockKeyhole className="h-4 w-4" />
        </span>
        <div>
          <p className="font-semibold text-foreground">Data slot</p>
          <p className="mt-1 text-sm text-muted-foreground">
            The embedding application resolves data for {String(slot || "this slot")}{" "}
            here.
          </p>
        </div>
      </div>
    </Section>
  );
}
