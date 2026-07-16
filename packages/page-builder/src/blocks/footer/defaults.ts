import type { FooterSettings } from "./settings";
import { generateUniqueId } from "../../utils";

export const footerDefaults: Partial<FooterSettings> = {
    logoText: "FrontLit",
    tagline:
        "Build your website, blog, help desk, newsletter and changelog — all from one dashboard.",
    columns: [
        {
            id: generateUniqueId(),
            title: "Product",
            links: [
                { id: generateUniqueId(), label: "Features", href: "#features" },
                { id: generateUniqueId(), label: "Pricing", href: "#pricing" },
                {
                    id: generateUniqueId(),
                    label: "Changelog",
                    href: "/changelog",
                },
            ],
        },
        {
            id: generateUniqueId(),
            title: "Resources",
            links: [
                { id: generateUniqueId(), label: "Blog", href: "/blog" },
                { id: generateUniqueId(), label: "Help center", href: "/help" },
                { id: generateUniqueId(), label: "Docs", href: "/docs" },
            ],
        },
        {
            id: generateUniqueId(),
            title: "Company",
            links: [
                { id: generateUniqueId(), label: "About", href: "/about" },
                { id: generateUniqueId(), label: "Contact", href: "/contact" },
            ],
        },
    ],
    copyrightText: "© FrontLit. All rights reserved.",
};
