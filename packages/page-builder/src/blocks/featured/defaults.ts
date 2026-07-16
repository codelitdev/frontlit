import type { FeaturedSettings } from "./settings";

export const featuredDefaults: Partial<FeaturedSettings> = {
    title: "Everything you need to run your business online",
    headerAlignment: "center",
    items: [
        {
            title: "Website Builder",
            description:
                "Design and publish beautiful pages with a drag-and-drop editor.",
            icon: "Globe",
        },
        {
            title: "Blog",
            description:
                "Publish articles and grow your audience with built-in SEO.",
            icon: "Newspaper",
        },
        {
            title: "Help Desk",
            description:
                "Support your customers with a shared inbox and ticketing.",
            icon: "LifeBuoy",
        },
        {
            title: "Email Newsletter",
            description:
                "Grow and email your subscriber list without leaving FrontLit.",
            icon: "Mail",
        },
        {
            title: "Chatbot",
            description:
                "Answer visitor questions instantly with an AI-powered chatbot.",
            icon: "MessageCircle",
        },
        {
            title: "Changelog",
            description:
                "Share product updates and keep your users in the loop.",
            icon: "History",
        },
    ],
};
