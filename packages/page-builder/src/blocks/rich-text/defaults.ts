import type { RichTextSettings } from "./settings";

export const richTextDefaults: Partial<RichTextSettings> = {
  text: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Write anything here — an announcement, a longer explanation, or a passage of prose that doesn't need a title or media.",
          },
        ],
      },
    ],
  },
  alignment: "left",
};
