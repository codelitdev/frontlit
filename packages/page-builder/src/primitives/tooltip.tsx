"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as React from "react";
import type { ThemeStyle } from "../models";
import { cn } from "./lib/utils";

const TooltipThemeContext = React.createContext<ThemeStyle | undefined>(undefined);

function useTooltipTheme(providedTheme?: ThemeStyle) {
  const contextTheme = React.useContext(TooltipThemeContext);
  return providedTheme ?? contextTheme;
}

export interface TooltipProviderProps
  extends React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Provider> {
  theme?: ThemeStyle;
}

export function TooltipProvider({ theme, children, ...props }: TooltipProviderProps) {
  return (
    <TooltipThemeContext.Provider value={theme}>
      <TooltipPrimitive.Provider {...props}>{children}</TooltipPrimitive.Provider>
    </TooltipThemeContext.Provider>
  );
}

export interface TooltipProps
  extends React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Root> {
  theme?: ThemeStyle;
}

export function Tooltip({ theme, children, ...props }: TooltipProps) {
  return (
    <TooltipThemeContext.Provider value={theme}>
      <TooltipPrimitive.Root {...props}>{children}</TooltipPrimitive.Root>
    </TooltipThemeContext.Provider>
  );
}

export const TooltipTrigger = TooltipPrimitive.Trigger;
export const TooltipPortal = TooltipPrimitive.Portal;

export interface TooltipContentProps
  extends React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> {
  theme?: ThemeStyle;
}

export const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  TooltipContentProps
>(({ className, sideOffset = 6, theme: providedTheme, ...props }, ref) => {
  const theme = useTooltipTheme(providedTheme);
  const styles = theme?.interactives?.tooltip;

  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          "z-50 w-fit rounded-sm bg-foreground px-2.5 py-1.5 text-xs font-medium text-background outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95",
          styles?.padding?.x,
          styles?.padding?.y,
          styles?.border?.width,
          styles?.border?.radius,
          styles?.border?.style,
          styles?.shadow,
          styles?.custom,
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
});
TooltipContent.displayName = TooltipPrimitive.Content.displayName;
