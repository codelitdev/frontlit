"use client";

import React, { useState } from "react";
import { Brush, Check, FilePenLine } from "lucide-react";
import type { Theme, Widget, WidgetInstance } from "../models";
import { cn } from "../primitives/lib/utils";
import { DesignFieldGroup } from "../blocks/_shared/design-fields";

const TABS = [
    { key: "data", label: "Data" },
    { key: "design", label: "Design" },
] as const;

type Tab = (typeof TABS)[number]["key"];

/**
 * The block settings panel body: a Data tab hosting the block's own editor
 * (content fields) and a Design tab hosting the shared section design
 * controls (max width, vertical padding, background). Mount with
 * `key={instance.widgetId}` so the tab selection resets per block.
 */
export function BlockSettings({
    instance,
    definition,
    theme,
    onChange,
}: {
    instance: WidgetInstance;
    definition: Widget<any>;
    theme: Theme;
    onChange: (settings: Record<string, unknown>) => void;
}) {
    const [tab, setTab] = useState<Tab>("data");
    const Editor = definition.editor;
    const settings = instance.settings ?? {};

    return (
        <div className="flex min-w-0 max-w-full flex-col">
            <div
                role="tablist"
                aria-label="Block settings sections"
                className="grid min-w-0 grid-cols-2 border-b border-border/80"
            >
                {TABS.map(({ key, label }) => {
                    const Icon = key === "data" ? FilePenLine : Brush;
                    return (
                        <button
                            key={key}
                            type="button"
                            role="tab"
                            aria-selected={tab === key}
                            className={cn(
                                "relative inline-flex h-11 min-w-0 items-center justify-center gap-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                                tab === key
                                    ? "text-foreground after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary"
                                    : "text-muted-foreground hover:text-foreground",
                            )}
                            onClick={() => setTab(key)}
                        >
                            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                            {label}
                        </button>
                    );
                })}
            </div>
            <div className="pt-5">
                {tab === "data" && Editor && (
                    <Editor
                        settings={settings as any}
                        theme={theme}
                        onChange={onChange}
                    />
                )}
            </div>
            {tab === "design" && (
                <div className="min-w-0 max-w-full space-y-5 pt-5">
                    <div>
                        <p className="text-sm font-semibold text-foreground">
                            Refine the look
                        </p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            Adjust layout and surface styles for this block.
                        </p>
                    </div>
                    {definition.layouts && definition.layouts.length > 0 && (
                        <div className="space-y-3 text-sm">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                    Layout
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Choose how this block is arranged.
                                </p>
                            </div>
                            <div
                                className="grid gap-2.5"
                                style={{
                                    gridTemplateColumns:
                                        "repeat(auto-fill, minmax(112px, 1fr))",
                                }}
                            >
                                {definition.layouts.map((layout, index) => {
                                    const active =
                                        (settings.layout as
                                            string | undefined) === layout.id ||
                                        (settings.layout == null &&
                                            index === 0);
                                    return (
                                        <button
                                            key={layout.id}
                                            type="button"
                                            aria-pressed={active}
                                            className={cn(
                                                "group relative flex min-h-16 items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                                                active
                                                    ? "border-primary/60 bg-primary/8 text-foreground shadow-sm"
                                                    : "border-border bg-muted/20 text-muted-foreground hover:border-primary/35 hover:bg-muted/60 hover:text-foreground",
                                            )}
                                            onClick={() =>
                                                onChange({
                                                    ...settings,
                                                    layout: layout.id,
                                                })
                                            }
                                        >
                                            <span>{layout.name}</span>
                                            {active && (
                                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                                    <Check
                                                        className="h-3 w-3"
                                                        aria-hidden="true"
                                                    />
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    <DesignFieldGroup
                        settings={settings as any}
                        theme={theme.theme}
                        update={(partial) =>
                            onChange({ ...settings, ...partial })
                        }
                    />
                </div>
            )}
        </div>
    );
}
