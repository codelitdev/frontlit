"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as React from "react";
import type { ThemeStyle } from "../models";
import { cn } from "./lib/utils";

const PopoverThemeContext = React.createContext<ThemeStyle | undefined>(undefined);

function usePopoverTheme(providedTheme?: ThemeStyle) {
  const contextTheme = React.useContext(PopoverThemeContext);
  return providedTheme ?? contextTheme;
}

export interface PopoverProps
  extends React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Root> {
  theme?: ThemeStyle;
}

export function Popover({ theme, children, ...props }: PopoverProps) {
  return (
    <PopoverThemeContext.Provider value={theme}>
      <PopoverPrimitive.Root {...props}>{children}</PopoverPrimitive.Root>
    </PopoverThemeContext.Provider>
  );
}

export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;
export const PopoverPortal = PopoverPrimitive.Portal;

export interface PopoverContentProps
  extends React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> {
  theme?: ThemeStyle;
}

export const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  PopoverContentProps
>(({ className, sideOffset = 4, theme: providedTheme, ...props }, ref) => {
  const theme = usePopoverTheme(providedTheme);
  const styles = theme?.interactives?.popover;

  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          "z-50 w-72 overflow-hidden rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
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
    </PopoverPrimitive.Portal>
  );
});
PopoverContent.displayName = PopoverPrimitive.Content.displayName;
