"use client";

import React from "react";
import * as Icons from "lucide-react";
import type { Widget } from "../models";

function resolveIcon(name?: string): React.ComponentType<{ className?: string }> {
    if (name && name in Icons) {
        return (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[
            name
        ];
    }
    return Icons.LayoutTemplate;
}

export function BlockPicker({
    blocks,
    onPick,
    onClose,
}: {
    blocks: Widget<any>[];
    onPick: (name: string) => void;
    onClose: () => void;
}) {
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={onClose}
        >
            <div
                className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-background shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <h3 className="text-sm font-semibold text-foreground">
                        Add a block
                    </h3>
                    <button
                        type="button"
                        aria-label="Close"
                        className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                        onClick={onClose}
                    >
                        <Icons.X className="h-4 w-4" />
                    </button>
                </div>
                <div className="grid grid-cols-2 gap-2 overflow-y-auto p-4 sm:grid-cols-3">
                    {blocks.map((block) => {
                        const Icon = resolveIcon(block.metadata.icon);
                        return (
                            <button
                                key={block.metadata.name}
                                type="button"
                                className="flex flex-col items-center gap-2 rounded-md border border-border p-4 text-center transition-colors hover:border-primary hover:bg-muted"
                                onClick={() => onPick(block.metadata.name)}
                            >
                                <Icon className="h-6 w-6 text-foreground" />
                                <span className="text-xs font-medium text-foreground">
                                    {block.metadata.displayName}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
