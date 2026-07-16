import type { WidgetDefaultSettings } from "../../models";

export interface MarqueeItem {
    id: string;
    text?: string;
    href?: string;
    /** Name of a lucide-react icon, e.g. "Globe" — overrides `text` when set. */
    icon?: string;
}

export interface MarqueeSettings extends WidgetDefaultSettings {
    items?: MarqueeItem[];
    direction?: "left" | "right";
    /** Scroll speed in pixels per second. */
    speed?: number;
    pauseOnHover?: boolean;
    /** Width in px of the edge fade-out effect; 0 disables it. */
    fadeWidth?: number;
    itemBackgroundColor?: string;
    itemForegroundColor?: string;
    itemBorderColor?: string;
    itemBorderRadius?: number;
    itemBorderWidth?: number;
    itemBorderStyle?: "solid" | "dashed" | "dotted" | "double" | "none";
}
