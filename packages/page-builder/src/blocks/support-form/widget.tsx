import React from "react";
import clsx from "clsx";
import type { ThemeStyle, WidgetProps } from "../../models";
import type { SupportFormSettings } from "./settings";
import { renderTitle, titleProps } from "../_shared/title";
import { TextRenderer } from "../../components/text-renderer";
import { Header1, Section, Subheader1 } from "../../primitives";
import { SupportForm } from "./form";

export function SupportFormWidget({
  settings: {
    title,
    titleLevel,
    titleSize,
    description,
    buttonCaption = "Submit ticket",
    successMessage = "Thanks — we've got your ticket and will reply by email soon.",
    alignment = "left",
    cssId,
    maxWidth,
    verticalPadding,
    background,
  },
  state: { theme },
  pageData,
  editing,
}: WidgetProps<SupportFormSettings>) {
  const overriddenTheme: ThemeStyle = JSON.parse(JSON.stringify(theme.theme));
  overriddenTheme.structure.page.width = maxWidth || theme.theme.structure.page.width;
  overriddenTheme.structure.section.padding.y =
    verticalPadding || theme.theme.structure.section.padding.y;

  const isCentered = alignment === "center";

  return (
    <Section theme={overriddenTheme} id={cssId} background={background}>
      <div
        className={clsx(
          "flex flex-col gap-4",
          isCentered ? "items-center text-center" : "items-start",
        )}
      >
        <Header1 theme={overriddenTheme} {...titleProps({ titleLevel, titleSize })}>
          {renderTitle(title, overriddenTheme)}
        </Header1>
        {description && (
          <Subheader1 theme={overriddenTheme} component="span">
            <TextRenderer json={description} theme={overriddenTheme} />
          </Subheader1>
        )}
      </div>
      <SupportForm
        theme={overriddenTheme}
        buttonCaption={buttonCaption}
        successMessage={successMessage}
        pageData={pageData}
        editing={editing}
      />
    </Section>
  );
}
