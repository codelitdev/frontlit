import type { WidgetMetadata } from "../../models";

export const supportFormMetadata: WidgetMetadata = {
  name: "support-form",
  displayName: "Support form",
  description:
    "Raises a support ticket, suggesting matching help articles before the visitor submits.",
  compatibleWith: ["site", "landing", "custom"],
  icon: "LifeBuoy",
};
