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
    const root = triggerWrapRef.current?.closest("[data-pb-theme], .pb-theme");
    setContainer(root instanceof HTMLElement ? root : null);
  }, []);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <span ref={triggerWrapRef}>{trigger}</span>
      </SheetTrigger>
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
