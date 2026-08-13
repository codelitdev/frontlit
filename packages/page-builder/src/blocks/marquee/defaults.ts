import type { MarqueeSettings } from "./settings";
import { generateUniqueId } from "../../utils";

export const marqueeDefaults: Partial<MarqueeSettings> = {
    items: [
        { id: generateUniqueId(), text: "Website" },
        { id: generateUniqueId(), text: "Content" },
        { id: generateUniqueId(), text: "Support" },
        { id: generateUniqueId(), text: "Engage" },
    ],
    direction: "right",
    speed: 60,
    pauseOnHover: true,
    fadeWidth: 50,
    itemForegroundColor: "",
    itemBackgroundColor: "",
    itemBorderColor: "",
    itemBorderRadius: 12,
    itemBorderWidth: 1,
    itemBorderStyle: "solid",
};
