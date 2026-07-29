import type { GridSettings } from "./settings";

export const gridDefaults: Partial<GridSettings> = {
    title: "Everything you need, in one place",
    headerAlignment: "center",
    columns: 3,
    items: [
        {
            title: "Website builder",
            description:
                "Design and publish pages with a drag-and-drop editor.",
            icon: "LayoutTemplate",
            mediaAlignment: "top",
        },
        {
            title: "Blog",
            description: "Publish articles and grow your audience.",
            icon: "Newspaper",
            mediaAlignment: "top",
        },
        {
            title: "Help desk",
            description: "Support your customers with a shared inbox.",
            icon: "Headset",
            mediaAlignment: "top",
        },
    ],
};
