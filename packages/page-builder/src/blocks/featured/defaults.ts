import type { FeaturedSettings } from "./settings";

export const featuredDefaults: Partial<FeaturedSettings> = {
    title: "Everything you need to run your business online",
    headerAlignment: "center",
    items: [
        {
            title: "Website",
            description:
                "Design and publish beautiful pages with a drag-and-drop editor.",
            icon: "Globe",
        },
        {
            title: "Content",
            description:
                "Publish articles, documentation, and product updates from one content system.",
            icon: "Newspaper",
        },
        {
            title: "Support",
            description:
                "Support customers with a shared inbox, ticketing, help center, and AI answers.",
            icon: "LifeBuoy",
        },
        {
            title: "Engage",
            description:
                "Grow your audience and send email without leaving FrontLit.",
            icon: "Mail",
        },
    ],
};
