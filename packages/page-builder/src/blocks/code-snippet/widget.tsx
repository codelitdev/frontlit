import React from "react";
import clsx from "clsx";
import type { ThemeStyle, WidgetProps } from "../../models";
import type { CodeSnippetSettings } from "./settings";
import { Caption, CodeSnippet, Section } from "../../primitives";

export function CodeSnippetWidget({
  settings: {
    code,
    showPrompt = true,
    caption,
    contentAlignment = "center",
    cssId,
    maxWidth,
    verticalPadding,
    background,
  },
  state: { theme },
  nextTheme,
}: WidgetProps<CodeSnippetSettings>) {
  const overriddenTheme: ThemeStyle = JSON.parse(JSON.stringify(theme.theme));
  overriddenTheme.structure.page.width = maxWidth || theme.theme.structure.page.width;
  overriddenTheme.structure.section.padding.y =
    verticalPadding || theme.theme.structure.section.padding.y;

  if (!code) return null;

  return (
    <Section
      theme={overriddenTheme}
      id={cssId}
      background={background}
      nextTheme={nextTheme}
    >
      <div
        className={clsx(
          "flex w-full max-w-2xl flex-col gap-3",
          contentAlignment === "center" ? "mx-auto items-center" : "items-start",
        )}
      >
        <CodeSnippet
          code={code}
          prompt={showPrompt ? "$" : undefined}
          theme={overriddenTheme}
        />
        {caption && <Caption theme={overriddenTheme}>{caption}</Caption>}
      </div>
    </Section>
  );
}
