"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";
import type { ThemeStyle } from "../models";
import { cn } from "./lib/utils";

const DialogThemeContext = React.createContext<ThemeStyle | undefined>(undefined);

function useDialogTheme(providedTheme?: ThemeStyle) {
  const contextTheme = React.useContext(DialogThemeContext);
  return providedTheme ?? contextTheme;
}

export interface DialogProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Root> {
  theme?: ThemeStyle;
}

export function Dialog({ theme, children, ...props }: DialogProps) {
  return (
    <DialogThemeContext.Provider value={theme}>
      <DialogPrimitive.Root {...props}>{children}</DialogPrimitive.Root>
    </DialogThemeContext.Provider>
  );
}

export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogPortal = DialogPrimitive.Portal;

export const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/60 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

export interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  closeClassName?: string;
  overlayClassName?: string;
  showCloseButton?: boolean;
  theme?: ThemeStyle;
}

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(
  (
    {
      children,
      className,
      closeClassName,
      overlayClassName,
      showCloseButton = true,
      theme: providedTheme,
      ...props
    },
    ref,
  ) => {
    const theme = useDialogTheme(providedTheme);
    const styles = theme?.interactives?.dialog;

    return (
      <DialogPrimitive.Portal>
        <DialogOverlay className={overlayClassName} />
        <DialogPrimitive.Content
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
            <DialogPrimitive.Close
              className={cn(
                "absolute top-4 right-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none",
                closeClassName,
              )}
            >
              <X className="size-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    );
  },
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

export function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-2 text-left", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
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

export interface DialogTitleProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title> {
  theme?: ThemeStyle;
}

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  DialogTitleProps
>(({ className, theme: providedTheme, ...props }, ref) => {
  const theme = useDialogTheme(providedTheme);
  const typography = theme?.typography?.header4;
  return (
    <DialogPrimitive.Title
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
DialogTitle.displayName = DialogPrimitive.Title.displayName;

export interface DialogDescriptionProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description> {
  theme?: ThemeStyle;
}

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  DialogDescriptionProps
>(({ className, theme: providedTheme, ...props }, ref) => {
  const theme = useDialogTheme(providedTheme);
  const typography = theme?.typography?.text2;
  return (
    <DialogPrimitive.Description
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
DialogDescription.displayName = DialogPrimitive.Description.displayName;
