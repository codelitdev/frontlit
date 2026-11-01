import { Extension, Node, type Extensions } from "@tiptap/core";
import Code from "@tiptap/extension-code";

/**
 * Rich documentation blocks (Callout, Tabs, Steps, Cards, Accordion, Code
 * group, Type table). Schema-only: no React, so the server-side docs profile
 * and the browser editor share them. Markdown form is MDX-style JSX with
 * literal props; see `markdown.ts`.
 */
export const CALLOUT_TYPES = ["note", "tip", "info", "warning", "danger"] as const;
export type CalloutType = (typeof CALLOUT_TYPES)[number];

export interface TypeTableRow {
  name: string;
  type: string;
  default: string | null;
  description: string | null;
  required: boolean;
}

function attr(name: string, fallback: unknown = null) {
  return {
    [name]: {
      default: fallback,
      parseHTML: (element: HTMLElement) => {
        const value = element.getAttribute(`data-${name}`);
        if (value === null) return fallback;
        try {
          return JSON.parse(value);
        } catch {
          return fallback;
        }
      },
      renderHTML: (attributes: Record<string, unknown>) =>
        attributes[name] === null || attributes[name] === undefined
          ? {}
          : { [`data-${name}`]: JSON.stringify(attributes[name]) },
    },
  };
}

function block(
  name: string,
  spec: {
    content?: string;
    group?: string;
    attrs?: Record<string, unknown>;
    atom?: boolean;
  },
) {
  const tag = `div[data-docs-block="${name}"]`;
  return Node.create({
    name,
    group: spec.group,
    content: spec.content,
    atom: spec.atom,
    defining: true,
    isolating: true,
    addAttributes() {
      return Object.assign(
        {},
        ...Object.entries(spec.attrs ?? {}).map(([key, value]) => attr(key, value)),
      );
    },
    parseHTML() {
      return [{ tag }];
    },
    renderHTML({ HTMLAttributes }) {
      return spec.atom
        ? ["div", { ...HTMLAttributes, "data-docs-block": name }]
        : ["div", { ...HTMLAttributes, "data-docs-block": name }, 0];
    },
  });
}

/** Inline code may sit inside links, bold, italic and strike (e.g. a linked `useUpload`). */
export const DocsCode = Code.extend({ excludes: "" });

export function createDocsBlockExtensions(): Extensions {
  return [
    DocsCode,
    block("callout", {
      group: "block",
      content: "block+",
      attrs: { type: null, title: null },
    }),
    block("tabs", { group: "block", content: "tab+" }),
    block("tab", { content: "block+", attrs: { label: "" } }),
    block("steps", { group: "block", content: "step+" }),
    block("step", { content: "block+" }),
    block("cards", { group: "block", content: "card+" }),
    block("card", {
      content: "block*",
      attrs: { title: "", href: null, icon: null },
    }),
    block("accordions", {
      group: "block",
      content: "accordion+",
      attrs: { type: null },
    }),
    block("accordion", { content: "block+", attrs: { title: "" } }),
    block("codeGroup", { group: "block", content: "codeBlock+" }),
    block("typeTable", { group: "block", atom: true, attrs: { rows: [] } }),
  ];
}

/** Node names owned by this module, in Markdown component order. */
export const DOCS_BLOCK_COMPONENTS = {
  Callout: "callout",
  Tabs: "tabs",
  Tab: "tab",
  Steps: "steps",
  Step: "step",
  Cards: "cards",
  Card: "card",
  Accordions: "accordions",
  Accordion: "accordion",
  CodeGroup: "codeGroup",
  TypeTable: "typeTable",
} as const;

/** Code fence `title="…"` metadata, shown as the block's file name or tab label. */
export const CodeBlockTitle = Extension.create({
  name: "codeBlockTitle",
  addGlobalAttributes() {
    return [
      {
        types: ["codeBlock"],
        attributes: {
          title: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-title"),
            renderHTML: (attributes) =>
              attributes.title ? { "data-title": attributes.title } : {},
          },
        },
      },
    ];
  },
});
