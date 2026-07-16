"use client";

import React from "react";
import {
    Globe,
    Monitor,
    Moon,
    Palette,
    Plus,
    Smartphone,
    Sun,
    Tablet,
} from "lucide-react";
import { Button } from "../primitives/components/ui/button";
import { cn } from "../primitives/lib/utils";

export type PreviewDevice = "mobile" | "tablet" | "desktop";

const DEVICES: Array<{
    key: PreviewDevice;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
}> = [
    { key: "mobile", label: "Mobile preview", icon: Smartphone },
    { key: "tablet", label: "Tablet preview", icon: Tablet },
    { key: "desktop", label: "Desktop preview", icon: Monitor },
];

export function BuilderTopBar({
    mode,
    onModeChange,
    device,
    onDeviceChange,
    onOpenTheme,
    onOpenSeo,
    onAddBlock,
}: {
    mode: "light" | "dark";
    onModeChange: (mode: "light" | "dark") => void;
    device: PreviewDevice;
    onDeviceChange: (device: PreviewDevice) => void;
    onOpenTheme: () => void;
    onOpenSeo: () => void;
    onAddBlock: () => void;
}) {
    return (
        <header className="flex h-14 w-full shrink-0 items-center justify-between border-b bg-background px-4">
            <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-foreground">
                    Page builder
                </span>
            </div>
            <div className="flex items-center gap-4">
                <div
                    className="flex items-center gap-0.5 rounded-md border border-border p-0.5"
                    role="group"
                    aria-label="Preview device"
                >
                    {DEVICES.map(({ key, label, icon: Icon }) => (
                        <button
                            key={key}
                            type="button"
                            title={label}
                            aria-label={label}
                            aria-pressed={device === key}
                            className={cn(
                                "inline-flex h-7 w-7 items-center justify-center rounded-sm transition-colors",
                                device === key
                                    ? "bg-muted text-foreground"
                                    : "text-muted-foreground hover:text-foreground",
                            )}
                            onClick={() => onDeviceChange(key)}
                        >
                            <Icon className="h-4 w-4" />
                        </button>
                    ))}
                </div>
                <div
                    className="h-6 w-px bg-border"
                    role="separator"
                    aria-orientation="vertical"
                />
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="icon"
                        title="Theme"
                        aria-label="Edit theme"
                        onClick={onOpenTheme}
                    >
                        <Palette className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="outline"
                        size="icon"
                        title="SEO"
                        aria-label="Edit SEO settings"
                        onClick={onOpenSeo}
                    >
                        <Globe className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="outline"
                        size="icon"
                        title={
                            mode === "light"
                                ? "Preview dark mode"
                                : "Preview light mode"
                        }
                        aria-label="Toggle light/dark preview"
                        onClick={() =>
                            onModeChange(mode === "light" ? "dark" : "light")
                        }
                    >
                        {mode === "light" ? (
                            <Moon className="h-4 w-4" />
                        ) : (
                            <Sun className="h-4 w-4" />
                        )}
                    </Button>
                </div>
                <div
                    className="h-6 w-px bg-border"
                    role="separator"
                    aria-orientation="vertical"
                />
                <Button
                    size="sm"
                    className="gap-2 whitespace-nowrap"
                    title="Add a new block to the page"
                    onClick={onAddBlock}
                >
                    <Plus className="h-4 w-4" />
                    Add block
                </Button>
            </div>
        </header>
    );
}
