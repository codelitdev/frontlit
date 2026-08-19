"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type WorkspaceSectionTab = {
    id: string;
    label: string;
    href: string;
    icon?: LucideIcon;
};

/** Underline tabs used by Content, Website, and Email. The hairline sits on
 * this nav only, so it stays as wide as the parent column — not the viewport. */
export function WorkspaceSectionTabs({
    items,
    currentId,
    ariaLabel,
    className,
}: {
    items: readonly WorkspaceSectionTab[];
    currentId: string;
    ariaLabel: string;
    className?: string;
}) {
    return (
        <nav
            aria-label={ariaLabel}
            className={cn("mb-6 flex w-full gap-1 border-b", className)}
        >
            {items.map((item) => {
                const active = item.id === currentId;
                const Icon = item.icon;
                return (
                    <Link
                        key={item.id}
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                            "-mb-px flex shrink-0 items-center gap-2 border-b-2 border-transparent px-3 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                            active && "border-foreground text-foreground",
                        )}
                    >
                        {Icon ? <Icon className="size-4" /> : null}
                        {item.label}
                    </Link>
                );
            })}
        </nav>
    );
}
