"use client";

import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { X } from "lucide-react";
import * as React from "react";
import type { ThemeStyle } from "../models";
import { cn } from "./lib/utils";

const AlertDialogThemeContext = React.createContext<ThemeStyle | undefined>(undefined);

function useAlertDialogTheme(providedTheme?: ThemeStyle) {
  const contextTheme = React.useContext(AlertDialogThemeContext);
  return providedTheme ?? contextTheme;
}

export interface AlertDialogProps
  extends React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Root> {
  theme?: ThemeStyle;
}

export function AlertDialog({ theme, children, ...props }: AlertDialogProps) {
  return (
    <AlertDialogThemeContext.Provider value={theme}>
      <AlertDialogPrimitive.Root {...props}>{children}</AlertDialogPrimitive.Root>
    </AlertDialogThemeContext.Provider>
  );
}

export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
export const AlertDialogCancel = AlertDialogPrimitive.Cancel;
export const AlertDialogAction = AlertDialogPrimitive.Action;
export const AlertDialogPortal = AlertDialogPrimitive.Portal;

export const AlertDialogOverlay = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/60 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
AlertDialogOverlay.displayName = AlertDialogPrimitive.Overlay.displayName;

export interface AlertDialogContentProps
  extends React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content> {
  closeClassName?: string;
  overlayClassName?: string;
  showCloseButton?: boolean;
  theme?: ThemeStyle;
}

export const AlertDialogContent = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Content>,
  AlertDialogContentProps
>(
  (
    {
      children,
      className,
      closeClassName,
      overlayClassName,
      showCloseButton = false,
      theme: providedTheme,
      ...props
    },
    ref,
  ) => {
    const theme = useAlertDialogTheme(providedTheme);
    const styles = theme?.interactives?.dialog;

    return (
      <AlertDialogPrimitive.Portal>
        <AlertDialogOverlay className={overlayClassName} />
        <AlertDialogPrimitive.Content
          ref={ref}
          className={cn(
            "fixed top-1/2 left-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-lg border bg-popover p-6 text-popover-foreground shadow-lg outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
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
        >
          {children}
          {showCloseButton ? (
            <AlertDialogPrimitive.Cancel
              className={cn(
                "absolute top-4 right-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                closeClassName,
              )}
            >
              <X className="size-4" />
              <span className="sr-only">Close</span>
            </AlertDialogPrimitive.Cancel>
          ) : null}
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    );
  },
);
AlertDialogContent.displayName = AlertDialogPrimitive.Content.displayName;

export function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-2 text-left", className)} {...props} />;
}

export function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

export interface AlertDialogTitleProps
  extends React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title> {
  theme?: ThemeStyle;
}

export const AlertDialogTitle = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Title>,
  AlertDialogTitleProps
>(({ className, theme: providedTheme, ...props }, ref) => {
  const theme = useAlertDialogTheme(providedTheme);
  const typography = theme?.typography?.header4;
  return (
    <AlertDialogPrimitive.Title
      ref={ref}
      className={cn(
        "text-lg leading-none font-semibold",
        typography?.fontFamily,
        typography?.fontSize,
        typography?.fontWeight,
        typography?.lineHeight,
        typography?.letterSpacing,
        typography?.textTransform,
        typography?.textDecoration,
        typography?.textOverflow,
        className,
      )}
      {...props}
    />
  );
});
AlertDialogTitle.displayName = AlertDialogPrimitive.Title.displayName;

export interface AlertDialogDescriptionProps
  extends React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description> {
  theme?: ThemeStyle;
}

export const AlertDialogDescription = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Description>,
  AlertDialogDescriptionProps
>(({ className, theme: providedTheme, ...props }, ref) => {
  const theme = useAlertDialogTheme(providedTheme);
  const typography = theme?.typography?.text2;
  return (
    <AlertDialogPrimitive.Description
      ref={ref}
      className={cn(
        "text-sm text-muted-foreground",
        typography?.fontFamily,
        typography?.fontSize,
        typography?.fontWeight,
        typography?.lineHeight,
        typography?.letterSpacing,
        typography?.textTransform,
        typography?.textDecoration,
        typography?.textOverflow,
        className,
      )}
      {...props}
    />
  );
});
AlertDialogDescription.displayName = AlertDialogPrimitive.Description.displayName;
