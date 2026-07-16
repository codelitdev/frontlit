import type { HeaderSettings } from "./settings";
import { generateUniqueId } from "../../utils";

export const headerDefaults: Partial<HeaderSettings> = {
    logoText: "FrontLit",
    links: [
        { id: generateUniqueId(), label: "Features", href: "#features" },
        { id: generateUniqueId(), label: "Pricing", href: "#pricing" },
        { id: generateUniqueId(), label: "Blog", href: "/blog" },
    ],
    ctaLabel: "Get started",
    ctaHref: "#",
    linkAlignment: "left",
    layout: "fixed",
    backdropBlur: false,
};
