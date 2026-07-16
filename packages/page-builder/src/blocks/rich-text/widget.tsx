import React from "react";
import type { ThemeStyle, WidgetProps } from "../../models";
import type { RichTextSettings } from "./settings";
import { TextRenderer } from "../../components";
import { Section, Text1 } from "../../primitives";

export function RichTextWidget({
    settings: {
        text,
        alignment = "left",
        cssId,
        maxWidth,
        verticalPadding,
        background,
    },
    state: { theme },
    nextTheme,
}: WidgetProps<RichTextSettings>) {
    const overriddenTheme: ThemeStyle = JSON.parse(JSON.stringify(theme.theme));
    overriddenTheme.structure.page.width =
        maxWidth || theme.theme.structure.page.width;
    overriddenTheme.structure.section.padding.y =
        verticalPadding || theme.theme.structure.section.padding.y;

    if (!text) return null;

    return (
        <Section
            theme={overriddenTheme}
            id={cssId}
            background={background}
            nextTheme={nextTheme}
        >
            <div style={{ textAlign: alignment }}>
                <Text1 theme={overriddenTheme} component="span">
                    <TextRenderer json={text} theme={overriddenTheme} />
                </Text1>
            </div>
        </Section>
    );
}
