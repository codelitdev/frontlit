import React from "react";
import clsx from "clsx";
import type { ThemeStyle, WidgetProps } from "../../models";
import type { EmailFormSettings } from "./settings";
import { renderTitle, titleProps } from "../_shared/title";
import { TextRenderer } from "../../components/text-renderer";
import { Header1, Section, Subheader1 } from "../../primitives";
import { EmailForm } from "./form";

export function EmailFormWidget({
  settings: {
    title,
    titleLevel,
    titleSize,
    description,
    buttonCaption = "Subscribe",
    successMessage = "Thanks for subscribing!",
    alignment = "left",
    layout = "stacked",
    cssId,
    maxWidth,
    verticalPadding,
    background,
  },
  state: { theme },
  pageData,
  editing,
}: WidgetProps<EmailFormSettings>) {
  const overriddenTheme: ThemeStyle = JSON.parse(JSON.stringify(theme.theme));
  overriddenTheme.structure.page.width = maxWidth || theme.theme.structure.page.width;
  overriddenTheme.structure.section.padding.y =
    verticalPadding || theme.theme.structure.section.padding.y;

  const descriptionNode = description && (
    <Subheader1 theme={overriddenTheme} component="span">
      <TextRenderer json={description} theme={overriddenTheme} />
    </Subheader1>
  );

  const heading =
    layout === "inline" ? (
      <div className="flex flex-col gap-1">
        <Header1
          theme={overriddenTheme}
          {...titleProps({ titleLevel, titleSize }, "h2", "text-xl")}
        >
          {renderTitle(title, overriddenTheme)}
        </Header1>
        {descriptionNode}
      </div>
    ) : (
      <div
        className={clsx(
          "flex flex-col gap-4",
          layout === "split" ? "items-start" : "contents",
        )}
      >
        <Header1 theme={overriddenTheme} {...titleProps({ titleLevel, titleSize })}>
          {renderTitle(title, overriddenTheme)}
        </Header1>
        {descriptionNode}
      </div>
    );

  return (
    <Section theme={overriddenTheme} id={cssId} background={background}>
      <EmailForm
        theme={overriddenTheme}
        layout={layout}
        alignment={alignment}
        buttonCaption={buttonCaption}
        successMessage={successMessage}
        pageData={pageData}
        editing={editing}
        heading={heading}
      />
    </Section>
  );
}
