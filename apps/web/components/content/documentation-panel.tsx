"use client";

import type { ComponentProps, ReactNode } from "react";
import * as DialogComponents from "@/components/ui/codelit/dialog";

function InlineDialog({ children }: ComponentProps<typeof DialogComponents.Dialog>) {
  return <>{children}</>;
}
function InlineContent({
  children,
}: ComponentProps<typeof DialogComponents.DialogContent>) {
  return <div className="space-y-4 rounded-lg border bg-card p-6">{children}</div>;
}
function InlineHeader({ children }: { children?: ReactNode }) {
  return <div className="space-y-2">{children}</div>;
}
function InlineTitle({ children }: { children?: ReactNode }) {
  return <h2 className="text-lg font-semibold">{children}</h2>;
}
function InlineDescription({ children }: { children?: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
function InlineFooter({
  children,
  className,
}: ComponentProps<typeof DialogComponents.DialogFooter>) {
  return <div className={`flex gap-2 ${className ?? ""}`}>{children}</div>;
}

export function documentationPanel(inline: boolean) {
  return inline
    ? {
        Dialog: InlineDialog,
        DialogContent: InlineContent,
        DialogHeader: InlineHeader,
        DialogTitle: InlineTitle,
        DialogDescription: InlineDescription,
        DialogFooter: InlineFooter,
      }
    : DialogComponents;
}
