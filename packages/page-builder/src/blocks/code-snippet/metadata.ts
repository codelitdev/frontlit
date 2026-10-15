import type { WidgetMetadata } from "../../models";

export const codeSnippetMetadata: WidgetMetadata = {
  name: "code-snippet",
  displayName: "Code snippet",
  description:
    "A command or short code sample with a copy button, like an install command.",
  compatibleWith: ["site", "landing", "blog", "post", "custom"],
  icon: "SquareTerminal",
};
