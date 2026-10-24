import React from "react";
import clsx from "clsx";
import type { ThemeStyle, WidgetProps } from "../../models";
import type { PricingSettings, PricingTier } from "./settings";
import { PricingPeriodSwitch } from "./period-switch";
import { renderTitle, titleProps } from "../_shared/title";
import { NavLink } from "../../components/nav-link";
import { TextRenderer } from "../../components/text-renderer";
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

// Static class names so Tailwind keeps them. 4+ plans wrap at 4 per row.
const lgColumns: Record<number, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
};

// With the period switch on, both values are rendered and the wrapper's
// `data-period` (set by `PricingPeriodSwitch`) picks which one shows.
const monthlyOnly = "group-data-[period=yearly]/pricing:hidden";
const yearlyOnly = "hidden group-data-[period=yearly]/pricing:block";

export function PricingWidget({
  settings: {
    title,
    titleLevel,
    titleSize,
    description,
    headerAlignment = "center",
    tiers,
    layout = "grid",
    pricingSwitcher,
    monthlyPriceCaption,
    yearlyPriceCaption,
    defaultPeriod = "yearly",
    cssId,
    maxWidth,
    verticalPadding,
    background,
  },
  state: { theme },
}: WidgetProps<PricingSettings>) {
  const overriddenTheme: ThemeStyle = JSON.parse(JSON.stringify(theme.theme));
  overriddenTheme.structure.page.width = maxWidth || theme.theme.structure.page.width;
  overriddenTheme.structure.section.padding.y =
    verticalPadding || theme.theme.structure.section.padding.y;

  const plans = tiers && tiers.length > 0 && (
    <div
      className={clsx(
        layout === "stacked"
          ? "mx-auto flex w-full max-w-xl flex-col gap-6"
          : [
              "grid grid-cols-1 gap-6 items-stretch",
              tiers.length === 1 && "mx-auto w-full max-w-xl",
              tiers.length >= 2 && "md:grid-cols-2",
              lgColumns[Math.min(tiers.length, 4)],
            ],
      )}
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
              {tier.highlighted && <Badge theme={overriddenTheme}>Most popular</Badge>}
            </div>
            <PageCardHeader theme={overriddenTheme}>
              {pricingSwitcher ? (
                <>
                  <span className={monthlyOnly}>{tier.price}</span>
                  <span className={yearlyOnly}>{tier.priceYearly || tier.price}</span>
                </>
              ) : (
                tier.price
              )}
            </PageCardHeader>
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
            {pricingSwitcher &&
            tier.buttonActionYearly &&
            tier.buttonActionYearly !== tier.buttonAction ? (
              <>
                <TierButton
                  tier={tier}
                  href={tier.buttonAction}
                  className={monthlyOnly}
                  theme={overriddenTheme}
                />
                <TierButton
                  tier={tier}
                  href={tier.buttonActionYearly}
                  className={yearlyOnly}
                  theme={overriddenTheme}
                />
              </>
            ) : (
              <TierButton
                tier={tier}
                href={tier.buttonAction}
                theme={overriddenTheme}
              />
            )}
          </PageCardContent>
        </PageCard>
      ))}
    </div>
  );

  return (
    <Section theme={overriddenTheme} id={cssId} background={background}>
      <div className="flex flex-col gap-8">
        <div
          className={clsx(
            "flex flex-col gap-4",
            headerAlignment === "center" ? "items-center text-center" : "items-start",
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
        {tiers &&
          tiers.length > 0 &&
          (pricingSwitcher ? (
            <PricingPeriodSwitch
              defaultPeriod={defaultPeriod}
              monthlyCaption={monthlyPriceCaption || "Monthly"}
              yearlyCaption={yearlyPriceCaption || "Yearly"}
              theme={overriddenTheme}
            >
              {plans}
            </PricingPeriodSwitch>
          ) : (
            plans
          ))}
      </div>
    </Section>
  );
}

function TierButton({
  tier,
  href,
  className,
  theme,
}: {
  tier: PricingTier;
  href?: string;
  className?: string;
  theme: ThemeStyle;
}) {
  if (!href || !tier.buttonCaption) return null;
  return (
    <NavLink href={href} className={clsx("w-full mt-auto", className)}>
      <Button
        theme={theme}
        variant={tier.highlighted ? "default" : "secondary"}
        className="w-full"
      >
        {tier.buttonCaption}
      </Button>
    </NavLink>
  );
}
