import type { HeaderSettings } from "./settings";
import { generateUniqueId } from "../../utils/generate-unique-id";

export const headerDefaults: Partial<HeaderSettings> = {
  logoCorners: 2,
  links: [
    { id: generateUniqueId(), label: "Features", href: "/#features" },
    { id: generateUniqueId(), label: "Pricing", href: "/#pricing" },
    { id: generateUniqueId(), label: "Docs", href: "/docs" },
    { id: generateUniqueId(), label: "Blog", href: "/blog" },
  ],
  ctaLabel: "Get started",
  ctaHref: "/help",
  linkAlignment: "left",
  layout: "fixed",
  backdropBlur: false,
  // Slider value 1. Keeps a new header compact instead of inheriting the
  // theme's content-section padding (`py-12` / slider 5 on most themes).
  verticalPadding: "py-4",
};
