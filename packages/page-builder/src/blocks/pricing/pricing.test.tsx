import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { themes } from "../../primitives/themes";
import { PricingWidget } from "./widget";
import type { PricingSettings, PricingTier } from "./settings";

const state = { theme: themes[0] };

const tier = (n: number, extra: Partial<PricingTier> = {}): PricingTier => ({
  name: `Plan ${n}`,
  price: `$${n}/month`,
  features: [],
  buttonCaption: "Buy",
  buttonAction: `/buy-${n}`,
  ...extra,
});

const render = (settings: PricingSettings) =>
  renderToStaticMarkup(
    <PricingWidget settings={settings} state={state} pageData={{}} />,
  );

describe("pricing columns", () => {
  it.each([
    [1, "lg:grid-cols-1"],
    [2, "lg:grid-cols-2"],
    [3, "lg:grid-cols-3"],
    [4, "lg:grid-cols-4"],
    [5, "lg:grid-cols-4"],
  ])("uses one column per plan for %i plans, up to 4", (count, cols) => {
    const html = render({
      tiers: Array.from({ length: count }, (_, i) => tier(i + 1)),
    });
    expect(html).toContain(cols);
    expect(html.match(/lg:grid-cols-\d/g)).toHaveLength(1);
    expect(html.includes("md:grid-cols-2")).toBe(count >= 2);
  });

  it("caps the width of a single plan", () => {
    expect(render({ tiers: [tier(1)] })).toContain("max-w-xl");
  });
});

describe("pricing period switch", () => {
  it("shows a single price and no switch by default", () => {
    const html = render({ tiers: [tier(1, { priceYearly: "$10/year" })] });
    expect(html).not.toContain('role="switch"');
    expect(html).not.toContain("$10/year");
  });

  it("renders both prices and a switch defaulting to yearly", () => {
    const html = render({
      pricingSwitcher: true,
      yearlyPriceCaption: "Yearly (2 months free)",
      tiers: [tier(1, { priceYearly: "$10/year" }), tier(2)],
    });
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('data-period="yearly"');
    expect(html).toContain("Monthly");
    expect(html).toContain("Yearly (2 months free)");
    expect(html).toContain("$1/month");
    expect(html).toContain("$10/year");
    // Without a yearly price, the monthly one is shown for both periods.
    expect(html.match(/\$2\/month/g)).toHaveLength(2);
  });

  it("honours defaultPeriod", () => {
    const html = render({
      pricingSwitcher: true,
      defaultPeriod: "monthly",
      tiers: [tier(1)],
    });
    expect(html).toContain('data-period="monthly"');
    expect(html).toContain('aria-checked="false"');
  });

  it("uses the yearly button link when set", () => {
    const html = render({
      pricingSwitcher: true,
      tiers: [tier(1, { buttonActionYearly: "/buy-1-yearly" }), tier(2)],
    });
    expect(html).toContain('href="/buy-1"');
    expect(html).toContain('href="/buy-1-yearly"');
    expect(html.match(/href="\/buy-2"/g)).toHaveLength(1);
  });
});
