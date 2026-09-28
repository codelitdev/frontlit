"use client";

import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { Circle } from "lucide-react";
import * as React from "react";
import type { ThemeStyle } from "../models";
import { cn } from "./lib/utils";

const RadioGroupThemeContext = React.createContext<ThemeStyle | undefined>(undefined);

function useRadioGroupTheme(providedTheme?: ThemeStyle) {
  const contextTheme = React.useContext(RadioGroupThemeContext);
  return providedTheme ?? contextTheme;
}

export interface RadioGroupProps
  extends React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root> {
  theme?: ThemeStyle;
}

export function RadioGroup({ theme, className, ...props }: RadioGroupProps) {
  return (
    <RadioGroupThemeContext.Provider value={theme}>
      <RadioGroupPrimitive.Root className={cn("grid gap-2", className)} {...props} />
    </RadioGroupThemeContext.Provider>
  );
}

export interface RadioGroupItemProps
  extends React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item> {
  theme?: ThemeStyle;
}

export const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  RadioGroupItemProps
>(({ className, theme: providedTheme, ...props }, ref) => {
  const theme = useRadioGroupTheme(providedTheme);
  const inputStyles = theme?.interactives?.input;
  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      className={cn(
        "aspect-square size-4 shrink-0 rounded-full border border-primary text-primary shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        inputStyles?.border?.width,
        inputStyles?.border?.radius,
        inputStyles?.border?.style,
        inputStyles?.shadow,
        inputStyles?.custom,
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
        <Circle className="size-2.5 fill-current" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
});
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName;
