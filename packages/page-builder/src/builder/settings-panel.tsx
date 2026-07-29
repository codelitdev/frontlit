"use client";

import React from "react";
import { PanelHeader } from "./panel-header";
import type { LucideIcon } from "lucide-react";

export function SettingsPanel({
    title,
    onClose,
    children,
    eyebrow,
    description,
    icon,
}: {
    title: string;
    onClose: () => void;
    children: React.ReactNode;
    eyebrow?: string;
    description?: string;
    icon?: LucideIcon;
}) {
    return (
        <aside className="flex h-full min-h-0 w-[min(360px,calc(100vw-2rem))] max-w-full shrink-0 flex-col overflow-hidden rounded-2xl border border-border/80 bg-background shadow-lg shadow-foreground/5">
            <PanelHeader
                title={title}
                onClose={onClose}
                eyebrow={eyebrow}
                description={description}
                icon={icon}
            />
            <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
                <div className="min-w-0 px-5 py-5">{children}</div>
            </div>
        </aside>
    );
}
