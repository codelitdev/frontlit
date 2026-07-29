"use client";

import React from "react";
import type { ThemeStyle, WidgetDefaultSettings } from "../../models";
import {
    MaxWidthSelector,
    SectionBackgroundPanel,
    VerticalPaddingSelector,
} from "../../builder/controls";
import { FieldGroup } from "./fields";

/**
 * Shared design settings group rendered in the block panel's Design tab.
 * Exposes the common section controls (max width, vertical padding,
 * background) that each block's widget already passes through to the
 * Section primitive. All settings are optional so existing pages keep
 * rendering unchanged.
 */
export function DesignFieldGroup<T extends WidgetDefaultSettings>({
    settings,
    theme,
    update,
}: {
    settings: T;
    /** Active theme, used so unset sliders display what's actually applied. */
    theme?: ThemeStyle;
    update: (partial: Partial<WidgetDefaultSettings>) => void;
}) {
    return (
        <FieldGroup title="Section styling">
            <MaxWidthSelector
                value={settings.maxWidth}
                themeDefault={theme?.structure?.page?.width}
                onChange={(maxWidth) => update({ maxWidth })}
            />
            <VerticalPaddingSelector
                value={settings.verticalPadding}
                themeDefault={theme?.structure?.section?.padding?.y}
                onChange={(verticalPadding) => update({ verticalPadding })}
            />
            <div className="flex min-w-0 max-w-full flex-col gap-3">
                <div className="min-w-0 space-y-0.5">
                    <p className="text-xs font-semibold text-foreground">
                        Background
                    </p>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                        Color, image, or pattern for this section surface.
                    </p>
                </div>
                <SectionBackgroundPanel
                    value={settings.background}
                    onChange={(background) => update({ background })}
                />
            </div>
        </FieldGroup>
    );
}
