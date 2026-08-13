import React from "react";
import { LockKeyhole } from "lucide-react";
import type { WidgetDefaultSettings, WidgetProps } from "../../models";

export interface DataSlotSettings extends WidgetDefaultSettings {
    /** Name matched against the host application's data-slot loaders. */
    slot: string;
}

/**
 * A reserved, host-resolved data region. The host passes its rendered result
 * through `PageRenderer`; the builder shows a generic placeholder instead.
 */
export function DataSlotWidget({
    data,
    editing,
    settings,
}: WidgetProps<DataSlotSettings>) {
    if (data !== undefined) return <>{data}</>;
    if (!editing) return null;

    return (
        <section className="border-y border-dashed border-border bg-muted/30 px-6 py-16">
            <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
                    <LockKeyhole className="h-4 w-4" />
                </span>
                <div>
                    <p className="font-semibold text-foreground">Data slot</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                        The embedding application resolves data for{" "}
                        {String(settings.slot || "this slot")} here.
                    </p>
                </div>
            </div>
        </section>
    );
}
