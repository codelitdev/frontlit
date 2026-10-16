import React from "react";
import type { WidgetProps, ThemeStyle } from "../../models";
import type { FooterSettings } from "./settings";
import { FRONTLIT_NAME, NavLink, ThemeModeSwitcher } from "../../components";
import {
  Caption,
  Header3,
  Header4,
  Link as PrimitiveLink,
  Section,
  Text2,
} from "../../primitives";

const FRONTLIT_TAGLINE =
  "Build your website, publish content, support users, and grow your audience from one dashboard.";

export function FooterWidget({
  settings: {
    logoText: ownLogoText,
    tagline: ownTagline,
    columns = [],
    copyrightText,
    layout = "columns",
    showThemeSwitcher = true,
    cssId,
    maxWidth,
    verticalPadding,
    background,
  },
  state: { theme },
  pageData,
  nextTheme,
  toggleTheme,
}: WidgetProps<FooterSettings>) {
  // Logo text and tagline follow Branding's title and subtitle. A site with
  // no branding yet shows FrontLit's, as the header does.
  const unbranded =
    !ownLogoText &&
    !pageData.siteTitle &&
    !pageData.siteLogoUrl &&
    !pageData.siteSubtitle;
  const logoText =
    ownLogoText ||
    pageData.siteTitle ||
    (pageData.siteLogoUrl ? undefined : FRONTLIT_NAME);
  const tagline =
    ownTagline || pageData.siteSubtitle || (unbranded ? FRONTLIT_TAGLINE : undefined);
  const overriddenTheme: ThemeStyle = JSON.parse(JSON.stringify(theme.theme));
  overriddenTheme.structure.page.width = maxWidth || theme.theme.structure.page.width;
  overriddenTheme.structure.section.padding.y =
    verticalPadding || theme.theme.structure.section.padding.y;

  const colorModeControl =
    showThemeSwitcher && toggleTheme ? (
      <ThemeModeSwitcher
        resolved={nextTheme ?? "light"}
        onToggle={toggleTheme}
        theme={overriddenTheme}
        size="sm"
        variant="outline"
      />
    ) : null;

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
          {logoText && (
            <Header4 theme={overriddenTheme} as="p">
              {logoText}
            </Header4>
          )}
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
            {colorModeControl}
          </div>
        </div>
      ) : layout === "centered" ? (
        <div className="flex w-full flex-col items-center gap-6 text-center">
          <div className="flex max-w-sm flex-col items-center gap-3">
            {logoText && (
              <Header3 theme={overriddenTheme} as="p">
                {logoText}
              </Header3>
            )}
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
            {logoText && (
              <Header3 theme={overriddenTheme} as="p">
                {logoText}
              </Header3>
            )}
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
      {(copyrightText || colorModeControl) && layout !== "minimal" && (
        <div
          className={
            layout === "centered"
              ? "mt-8 flex flex-col items-center gap-4 border-t pt-6 text-center"
              : "mt-8 flex items-center justify-between gap-4 border-t pt-6"
          }
        >
          {copyrightText && <Caption theme={overriddenTheme}>{copyrightText}</Caption>}
          {colorModeControl && (
            <div className={layout === "centered" ? undefined : "ml-auto"}>
              {colorModeControl}
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
