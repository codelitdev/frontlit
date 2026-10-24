"use client";

import { type ReactNode, useId, useState } from "react";
import type { ThemeStyle } from "../../models";
import type { PricingPeriod } from "./settings";
import { Label, Switch } from "../../primitives";

/**
 * Monthly/Yearly switch for the pricing block. The plans are rendered on the
 * server with both prices; this only flips `data-period` on the wrapper and
 * CSS shows the matching one, so prices are in the HTML before hydration.
 */
export function PricingPeriodSwitch({
  defaultPeriod,
  monthlyCaption,
  yearlyCaption,
  theme,
  children,
}: {
  defaultPeriod: PricingPeriod;
  monthlyCaption: string;
  yearlyCaption: string;
  theme: ThemeStyle;
  children: ReactNode;
}) {
  const [period, setPeriod] = useState<PricingPeriod>(defaultPeriod);
  const id = useId();
  const monthlyId = `${id}-monthly`;
  const yearlyId = `${id}-yearly`;

  return (
    <div data-period={period} className="group/pricing flex flex-col gap-8">
      <div className="flex items-center justify-center gap-3">
        <Label
          id={monthlyId}
          theme={theme}
          className="cursor-pointer"
          onClick={() => setPeriod("monthly")}
        >
          {monthlyCaption}
        </Label>
        <Switch
          theme={theme}
          checked={period === "yearly"}
          onCheckedChange={(checked) => setPeriod(checked ? "yearly" : "monthly")}
          aria-labelledby={yearlyId}
          aria-describedby={monthlyId}
        />
        <Label
          id={yearlyId}
          theme={theme}
          className="cursor-pointer"
          onClick={() => setPeriod("yearly")}
        >
          {yearlyCaption}
        </Label>
      </div>
      {children}
    </div>
  );
}
