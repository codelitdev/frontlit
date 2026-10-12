import React from "react";
import clsx from "clsx";
import type { ThemeStyle, WidgetProps } from "../../models";
import type { PricingSettings } from "./settings";
import { NavLink, TextRenderer } from "../../components";
import {
  Badge,
  Button,
  Header1,
  PageCard,
  PageCardContent,
  PageCardHeader,
  Preheader,
  Section,
  Subheader1,
  Text1,
  Text2,
} from "../../primitives";

export function PricingWidget({
  settings: {
    title,
    description,
    headerAlignment = "center",
    tiers,
    layout = "grid",
    cssId,
    maxWidth,
    verticalPadding,
    background,
  },
  state: { theme },
  nextTheme,
}: WidgetProps<PricingSettings>) {
  const overriddenTheme: ThemeStyle = JSON.parse(JSON.stringify(theme.theme));
  overriddenTheme.structure.page.width = maxWidth || theme.theme.structure.page.width;
  overriddenTheme.structure.section.padding.y =
    verticalPadding || theme.theme.structure.section.padding.y;

  return (
    <Section
      theme={overriddenTheme}
      id={cssId}
      background={background}
      nextTheme={nextTheme}
    >
      <div className="flex flex-col gap-8">
        <div
          className={clsx(
            "flex flex-col gap-4",
            headerAlignment === "center" ? "items-center text-center" : "items-start",
          )}
        >
          <Header1 theme={overriddenTheme}>{title}</Header1>
          {description && (
            <Subheader1 theme={overriddenTheme} component="span">
              <TextRenderer json={description} theme={overriddenTheme} />
            </Subheader1>
          )}
        </div>
        {tiers && tiers.length > 0 && (
          <div
            className={
              layout === "stacked"
                ? "mx-auto flex w-full max-w-xl flex-col gap-6"
                : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch"
            }
          >
            {tiers.map((tier, index) => (
              <PageCard
                key={index}
                theme={overriddenTheme}
                className={clsx(
                  tier.highlighted && "ring-2 ring-primary",
                  layout === "highlight" &&
                    tier.highlighted &&
                    "relative z-10 shadow-xl md:-translate-y-3",
                )}
              >
                <PageCardContent
                  theme={overriddenTheme}
                  className="h-full flex flex-col gap-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Preheader theme={overriddenTheme}>{tier.name}</Preheader>
                    {tier.highlighted && (
                      <Badge theme={overriddenTheme}>Most popular</Badge>
                    )}
                  </div>
                  <PageCardHeader theme={overriddenTheme}>{tier.price}</PageCardHeader>
                  {tier.description && (
                    <Text1 theme={overriddenTheme}>{tier.description}</Text1>
                  )}
                  {tier.features && tier.features.length > 0 && (
                    <div className="grow flex flex-col gap-2">
                      {tier.features.map((feature, i) => (
                        <Text2 key={i} theme={overriddenTheme}>
                          {feature}
                        </Text2>
                      ))}
                    </div>
                  )}
                  {tier.buttonAction && tier.buttonCaption && (
                    <NavLink href={tier.buttonAction} className="w-full mt-auto">
                      <Button
                        theme={overriddenTheme}
                        variant={tier.highlighted ? "default" : "secondary"}
                        className="w-full"
                      >
                        {tier.buttonCaption}
                      </Button>
                    </NavLink>
                  )}
                </PageCardContent>
              </PageCard>
            ))}
          </div>
        )}
      </div>
    </Section>
  );
}
