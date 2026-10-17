import React from "react";
import { Code2 } from "lucide-react";
import type { ThemeStyle, WidgetProps } from "../../models";
import type { EmbedSettings } from "./settings";
import { InlineEmbed } from "../../components/inline-embed";
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
  editing,
}: WidgetProps<EmbedSettings>) {
  const overriddenTheme: ThemeStyle = JSON.parse(JSON.stringify(theme.theme));
  overriddenTheme.structure.page.width = maxWidth || theme.theme.structure.page.width;
  overriddenTheme.structure.section.padding.y =
    verticalPadding || theme.theme.structure.section.padding.y;

  if (!content) {
    if (!editing) return null;

    return (
      <Section theme={overriddenTheme} id={cssId} background={background}>
        <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-6 py-12 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
            <Code2 className="h-4 w-4" />
          </span>
          <div>
            <p className="font-semibold text-foreground">Embed external content</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Paste an embed URL or script snippet in the block settings.
            </p>
          </div>
        </div>
      </Section>
    );
  }

  const isScript = contentType === "script";
  const ratio = aspectRatio !== "default" ? aspectRatioMap[aspectRatio] : undefined;

  // Snippets size themselves unless an aspect ratio is set; URL iframes need
  // an explicit height.
  const containerStyle: React.CSSProperties = ratio
    ? { position: "relative", paddingTop: `${100 / ratio}%` }
    : { position: "relative", height: isScript ? undefined : height };

  const fillStyle: React.CSSProperties = ratio
    ? { position: "absolute", inset: 0, width: "100%", height: "100%" }
    : { width: "100%", height: "100%" };

  return (
    <Section theme={overriddenTheme} id={cssId} background={background}>
      <div style={containerStyle}>
        {isScript ? (
          <InlineEmbed content={content} style={ratio ? fillStyle : undefined} />
        ) : (
          <iframe
            src={content}
            style={fillStyle}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title="Embedded content"
          />
        )}
        {/* Clicks inside an iframe (a URL embed, or one inside a snippet)
            never reach the editor, so cover the embed while editing to let a
            click select the block. */}
        {editing && <div className="absolute inset-0" />}
      </div>
    </Section>
  );
}
