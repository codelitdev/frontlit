import type { WidgetMetadata } from "../../models";

export const emailFormMetadata: WidgetMetadata = {
    name: "email-form",
    displayName: "Email signup",
    description: "A newsletter signup form with a title, description and email input.",
    compatibleWith: ["site", "landing", "blog", "post", "custom"],
};
