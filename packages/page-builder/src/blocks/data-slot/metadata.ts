import type { WidgetMetadata } from "../../models";

export const dataSlotMetadata: WidgetMetadata = {
  name: "data-slot",
  displayName: "Data slot",
  description:
    "A host-resolved data region. Its data source and presentation belong to the embedding application.",
  compatibleWith: ["site", "blog", "landing", "post", "custom"],
  icon: "Database",
};
