import type { WidgetMetadata } from "../../models";

export const marqueeMetadata: WidgetMetadata = {
    name: "marquee",
    displayName: "Marquee",
    description:
        "An infinite horizontally-scrolling row of text or icons — useful for logo clouds or highlight tickers.",
    compatibleWith: ["site", "landing", "blog", "post", "custom"],
};
