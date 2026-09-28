"use client";

import * as AvatarPrimitive from "@radix-ui/react-avatar";
import * as React from "react";
import type { ThemeStyle } from "../models";
import { cn } from "./lib/utils";

const AvatarThemeContext = React.createContext<ThemeStyle | undefined>(undefined);

export interface AvatarProps
  extends React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root> {
  theme?: ThemeStyle;
}

export function Avatar({ className, theme, ...props }: AvatarProps) {
  return (
    <AvatarThemeContext.Provider value={theme}>
      <AvatarPrimitive.Root
        className={cn(
          "relative flex size-10 shrink-0 overflow-hidden rounded-full bg-muted",
          className,
        )}
        {...props}
      />
    </AvatarThemeContext.Provider>
  );
}

export const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image
    ref={ref}
    className={cn("aspect-square size-full object-cover", className)}
    {...props}
  />
));
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

export const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => {
  const theme = React.useContext(AvatarThemeContext);
  const typography = theme?.typography?.text2;
  return (
    <AvatarPrimitive.Fallback
      ref={ref}
      className={cn(
        "flex size-full items-center justify-center bg-muted text-muted-foreground",
        typography?.fontFamily,
        typography?.fontSize,
        typography?.fontWeight,
        typography?.lineHeight,
        typography?.letterSpacing,
        className,
      )}
      {...props}
    />
  );
});
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;
