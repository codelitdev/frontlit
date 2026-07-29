"use client";

import React from "react";
import { Layers3, X, type LucideIcon } from "lucide-react";
import { Button } from "../primitives/components/ui/button";

interface PanelHeaderProps {
    title: string;
    onClose: () => void;
    eyebrow?: string;
    description?: string;
    icon?: LucideIcon;
}

export function PanelHeader({
    title,
    onClose,
    eyebrow = "Settings",
    description,
    icon: Icon = Layers3,
}: PanelHeaderProps) {
    return (
        <div className="sticky top-0 z-10 border-b border-border/80 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <div className="flex items-start gap-3 px-5 py-4">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        {eyebrow}
                    </p>
                    <h2 className="mt-1 truncate text-base font-semibold tracking-tight text-foreground">
                        {title}
                    </h2>
                    {description && (
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                            {description}
                        </p>
                    )}
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    className="-mr-2 -mt-1 h-8 w-8 shrink-0 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={`Close ${title} settings`}
                    onClick={onClose}
                >
                    <X className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}
