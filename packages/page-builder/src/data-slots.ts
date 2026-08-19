import type { ReactNode } from "react";
import type { PageData, WidgetInstance } from "./models";

/** Context supplied to a host application's data-slot loader. */
export interface DataSlotLoadRequest {
    /** The slot identifier declared in `instance.settings.slot`. */
    slot: string;
    /** The full persisted block configuration. */
    instance: WidgetInstance;
    /** Page context supplied by the host renderer. */
    pageData: PageData;
}

/** A host-owned resolver for one named data slot. */
export type DataSlotLoader = (
    request: DataSlotLoadRequest,
) => ReactNode | Promise<ReactNode>;

export type DataSlotLoaders = Readonly<Record<string, DataSlotLoader>>;

/**
 * Resolves generic data-slot blocks before passing their output to
 * `PageRenderer`. The page-builder package deliberately does not fetch data
 * or understand a host application's domain model.
 */
export async function loadDataSlots(
    layout: readonly WidgetInstance[],
    loaders: DataSlotLoaders,
    pageData: PageData,
): Promise<Record<string, ReactNode>> {
    const slots = layout.filter((instance) => instance.name === "data-slot");
    const resolved = await Promise.all(
        slots.map(async (instance) => {
            const slot = instance.settings?.slot;
            if (typeof slot !== "string" || !slot) return null;
            const loader = loaders[slot];
            if (!loader) return null;
            return [slot, await loader({ slot, instance, pageData })] as const;
        }),
    );
    const output: Record<string, ReactNode> = {};
    for (const entry of resolved) {
        if (entry) output[entry[0]] = entry[1];
    }
    return output;
}
