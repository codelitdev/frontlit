import type { Alignment, WidgetDefaultSettings } from "../../models";

export interface FaqItem {
    id: string;
    question: string;
    answer: string;
}

export interface FaqSettings extends WidgetDefaultSettings {
    title?: string;
    headerAlignment?: Alignment;
    items?: FaqItem[];
    layout?: "list" | "cards" | "columns";
}
