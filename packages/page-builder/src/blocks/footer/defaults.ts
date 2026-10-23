import type { FooterSettings } from "./settings";
import { generateUniqueId } from "../../utils/generate-unique-id";

export const footerDefaults: Partial<FooterSettings> = {
  showThemeSwitcher: true,
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
