import React from "react";
import { LockKeyhole } from "lucide-react";
import type { WidgetProps } from "../../models";

/**
 * A reserved slot for content owned by a public route rather than block
 * settings. Public routes pass their native content through PageRenderer;
 * the builder shows this representative placeholder instead.
 */
export function PageContentWidget({ content, editing }: WidgetProps) {
    if (content !== undefined) return <>{content}</>;
    if (!editing) return null;

    return (
        <section className="border-y border-dashed border-border bg-muted/30 px-6 py-16">
            <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
                    <LockKeyhole className="h-4 w-4" />
                </span>
                <div>
                    <p className="font-semibold text-foreground">
                        Page content
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                        FrontLit renders this page&apos;s published content
                        here.
                    </p>
                </div>
            </div>
        </section>
    );
}
