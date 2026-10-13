import type { FooterSettings } from "./settings";
import { generateUniqueId } from "../../utils";

export const footerDefaults: Partial<FooterSettings> = {
  logoText: "FrontLit",
  tagline:
    "Build your website, publish content, support users, and grow your audience from one dashboard.",
  columns: [
    {
      id: generateUniqueId(),
      title: "Product",
      links: [
        {
          id: generateUniqueId(),
          label: "Features",
          href: "/#features",
        },
        { id: generateUniqueId(), label: "Pricing", href: "/#pricing" },
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
      title: "Legal",
      links: [
        {
          id: generateUniqueId(),
          label: "Terms of use",
          href: "/terms",
        },
        {
          id: generateUniqueId(),
          label: "Privacy policy",
          href: "/privacy",
        },
      ],
    },
  ],
  copyrightText: "© FrontLit. All rights reserved.",
};
