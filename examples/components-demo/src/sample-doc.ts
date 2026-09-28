import type { TextEditorContent } from "@frontlit/text-editor";

/** Seed content so the renderer has something to show on first paint. */
export const sampleDoc: TextEditorContent = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "A standalone rich-text editor" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "This Vite app talks to the published ",
        },
        {
          type: "text",
          marks: [{ type: "bold" }],
          text: "@frontlit/text-editor",
        },
        {
          type: "text",
          text: " package. Edit on the left; the static renderer on the right consumes the same TipTap JSON.",
        },
      ],
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "What is in the box" }],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Toolbar, bubble menu, tables, images, and links",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Code blocks with syntax highlighting",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "No Next.js and no upload backend — images embed as data URLs unless you supply a picker",
                },
              ],
            },
          ],
        },
      ],
    },
    {
      type: "codeBlock",
      attrs: { language: "tsx" },
      content: [
        {
          type: "text",
          text: 'import { Editor, TextRenderer } from "@frontlit/text-editor";\nimport "@frontlit/text-editor/styles.css";',
        },
      ],
    },
    {
      type: "blockquote",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Persist the JSON however you like. TextRenderer is the read model.",
            },
          ],
        },
      ],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "See also " },
        {
          type: "text",
          marks: [
            {
              type: "link",
              attrs: {
                href: "https://www.npmjs.com/package/@frontlit/text-editor",
                target: "_blank",
              },
            },
          ],
          text: "the npm package",
        },
        { type: "text", text: "." },
      ],
    },
  ],
};
