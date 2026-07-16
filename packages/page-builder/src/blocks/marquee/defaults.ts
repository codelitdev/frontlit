import type { MarqueeSettings } from "./settings";
import { generateUniqueId } from "../../utils";

export const marqueeDefaults: Partial<MarqueeSettings> = {
    items: [
        { id: generateUniqueId(), text: "Website builder" },
        { id: generateUniqueId(), text: "Blog" },
        { id: generateUniqueId(), text: "Help desk" },
        { id: generateUniqueId(), text: "Newsletter" },
        { id: generateUniqueId(), text: "Changelog" },
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
