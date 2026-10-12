import React from "react";
import type { WidgetProps, ThemeStyle } from "../../models";
import type { FooterSettings } from "./settings";
import { NavLink } from "../../components";
import {
  Caption,
  Header3,
  Header4,
  Link as PrimitiveLink,
  Section,
  Text2,
} from "../../primitives";

export function FooterWidget({
  settings: {
    logoText,
    tagline,
    columns = [],
    copyrightText,
    layout = "columns",
    cssId,
    maxWidth,
    verticalPadding,
    background,
  },
  state: { theme },
  nextTheme,
}: WidgetProps<FooterSettings>) {
  const overriddenTheme: ThemeStyle = JSON.parse(JSON.stringify(theme.theme));
  overriddenTheme.structure.page.width = maxWidth || theme.theme.structure.page.width;
  overriddenTheme.structure.section.padding.y =
    verticalPadding || theme.theme.structure.section.padding.y;

  return (
    <Section
      theme={overriddenTheme}
      component="footer"
      id={cssId}
      background={background}
      nextTheme={nextTheme}
      className="border-t"
    >
      {layout === "minimal" ? (
        <div className="flex w-full flex-wrap items-center justify-between gap-4">
          {logoText && <Header4 theme={overriddenTheme}>{logoText}</Header4>}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {columns.flatMap((column) =>
              column.links.map((link) => (
                <NavLink
                  key={`${column.id}-${link.id}`}
                  href={link.href}
                  className="no-underline"
                >
                  <PrimitiveLink theme={overriddenTheme} className="text-xs">
                    {link.label}
                  </PrimitiveLink>
                </NavLink>
              )),
            )}
            {copyrightText && (
              <Caption theme={overriddenTheme}>{copyrightText}</Caption>
            )}
          </div>
        </div>
      ) : layout === "centered" ? (
        <div className="flex w-full flex-col items-center gap-6 text-center">
          <div className="flex max-w-sm flex-col items-center gap-3">
            {logoText && <Header3 theme={overriddenTheme}>{logoText}</Header3>}
            {tagline && <Text2 theme={overriddenTheme}>{tagline}</Text2>}
          </div>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
            {columns.flatMap((column) =>
              column.links.map((link) => (
                <NavLink
                  key={`${column.id}-${link.id}`}
                  href={link.href}
                  className="no-underline"
                >
                  <PrimitiveLink theme={overriddenTheme} className="text-xs">
                    {link.label}
                  </PrimitiveLink>
                </NavLink>
              )),
            )}
          </div>
        </div>
      ) : (
        <div className="flex w-full flex-col gap-8 lg:!flex-row lg:justify-between">
          <div className="flex max-w-sm flex-col gap-3">
            {logoText && <Header3 theme={overriddenTheme}>{logoText}</Header3>}
            {tagline && <Text2 theme={overriddenTheme}>{tagline}</Text2>}
          </div>
          <div className="flex flex-col flex-wrap gap-8 lg:!flex-row">
            {columns.map((column) => (
              <div key={column.id} className="flex flex-col gap-3 lg:min-w-[140px]">
                <Header4 theme={overriddenTheme} className="text-sm">
                  {column.title}
                </Header4>
                <div className="flex flex-col gap-2">
                  {column.links.map((link) => (
                    <NavLink key={link.id} href={link.href} className="no-underline">
                      <PrimitiveLink theme={overriddenTheme} className="text-xs">
                        {link.label}
                      </PrimitiveLink>
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {copyrightText && layout !== "minimal" && (
        <div
          className={
            layout === "centered"
              ? "mt-8 border-t pt-6 text-center"
              : "mt-8 border-t pt-6"
          }
        >
          <Caption theme={overriddenTheme}>{copyrightText}</Caption>
        </div>
      )}
    </Section>
  );
}
