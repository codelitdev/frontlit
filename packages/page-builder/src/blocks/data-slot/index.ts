import type { Widget } from "../../models";
import { dataSlotMetadata } from "./metadata";
import { DataSlotWidget, type DataSlotSettings } from "./widget";

export const DataSlot: Widget<DataSlotSettings> = {
    metadata: dataSlotMetadata,
    widget: DataSlotWidget,
};

export type { DataSlotSettings } from "./widget";
