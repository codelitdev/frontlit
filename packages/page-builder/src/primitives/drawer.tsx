"use client";

import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import type { ThemeStyle } from "../models";
import { Sheet, SheetContent, SheetTrigger } from "./components/ui/sheet";
import { cn } from "./lib/utils";

interface DrawerProps {
  trigger: ReactNode;
  children: ReactNode;
  side?: "left" | "right" | "top" | "bottom";
  open: boolean;
  setOpen: (open: boolean) => void;
  style?: React.CSSProperties;
  className?: string;
  theme?: ThemeStyle;
}

export function Drawer({
  trigger,
  children,
  side = "left",
  open,
  setOpen,
  style,
  className = "",
  theme: _theme,
}: DrawerProps) {
  const triggerWrapRef = useRef<HTMLSpanElement>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const root = triggerWrapRef.current?.closest<HTMLElement>(
      "[data-pb-theme], .pb-theme",
    );
    // Not `instanceof HTMLElement`: inside the builder's preview iframe the
    // root belongs to the iframe's realm, so that check always fails and the
    // sheet would open over the whole editor instead of the preview.
    setContainer(root ?? null);
  }, []);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {/* The trigger itself gets the trigger props (a span with
          type="button" around a button is invalid ARIA); the span only
          finds the theme root. */}
      <span ref={triggerWrapRef} className="contents">
        <SheetTrigger asChild>{trigger}</SheetTrigger>
      </span>
      <SheetContent
        side={side}
        style={style}
        container={container}
        className={cn(
          "bg-background text-foreground",
          !container && "pb-theme",
          className,
        )}
      >
        {children}
      </SheetContent>
    </Sheet>
  );
}
