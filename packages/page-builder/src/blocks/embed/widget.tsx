import React from "react";
import type { ThemeStyle, WidgetProps } from "../../models";
import type { EmbedSettings } from "./settings";
import { SandboxedEmbed } from "../../components";
import { Section } from "../../primitives";

const aspectRatioMap: Record<string, number> = {
    "16:9": 16 / 9,
    "4:3": 4 / 3,
    "1:1": 1,
};

export function EmbedWidget({
    settings: {
        contentType = "url",
        content,
        aspectRatio = "default",
        height = 500,
        cssId,
        maxWidth,
        verticalPadding,
        background,
    },
    state: { theme },
    nextTheme,
}: WidgetProps<EmbedSettings>) {
    const overriddenTheme: ThemeStyle = JSON.parse(JSON.stringify(theme.theme));
    overriddenTheme.structure.page.width =
        maxWidth || theme.theme.structure.page.width;
    overriddenTheme.structure.section.padding.y =
        verticalPadding || theme.theme.structure.section.padding.y;

    if (!content) return null;

    const isScript = contentType === "script";
    const ratio =
        aspectRatio !== "default" ? aspectRatioMap[aspectRatio] : undefined;

    const containerStyle: React.CSSProperties = ratio
        ? { position: "relative", paddingTop: `${100 / ratio}%` }
        : !isScript
          ? { height }
          : {};

    const iframeStyle: React.CSSProperties = ratio
        ? { position: "absolute", inset: 0, width: "100%", height: "100%" }
        : { width: "100%", height: "100%" };

    return (
        <Section
            theme={overriddenTheme}
            id={cssId}
            background={background}
            nextTheme={nextTheme}
        >
            <div style={containerStyle}>
                {isScript ? (
                    <SandboxedEmbed content={content} style={iframeStyle} />
                ) : (
                    <iframe
                        src={content}
                        style={iframeStyle}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        title="Embedded content"
                    />
                )}
            </div>
        </Section>
    );
}
