import {
  Extension,
  getSchema,
  Node,
  type AnyExtension,
  type Extensions,
} from "@tiptap/core";
import type { Schema } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import Code from "@tiptap/extension-code";
import CodeBlock from "@tiptap/extension-code-block";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Heading from "@tiptap/extension-heading";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { Dropcursor, Gapcursor, Placeholder, TrailingNode } from "@tiptap/extensions";
import { createId } from "../create-id";
import { lowlight } from "./lowlight";
import { isSafeUrl } from "./urls";
import type { BlockSchema, Profile } from "./types";

/** Block attributes are stored on the HTML element as JSON (copy and paste inside the editor). */
function htmlAttribute(name: string, fallback: unknown) {
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

/** The Tiptap node for a block schema; schema-only, no React. */
export function createBlockNode(schema: BlockSchema) {
  const atom = schema.content === undefined;
  return Node.create({
    name: schema.name,
    group: schema.group,
    content: schema.content,
    atom: atom || undefined,
    selectable: atom || undefined,
    draggable: atom || undefined,
    defining: true,
    isolating: true,
    addAttributes() {
      return Object.assign(
        {},
        ...Object.entries(schema.attrs).map(([key, spec]) =>
          htmlAttribute(key, spec.default),
        ),
      );
    },
    parseHTML() {
      return [
        { tag: `div[data-te-block="${schema.name}"]` },
        // Copied from an editor before blocks moved out of the docs profile.
        { tag: `div[data-docs-block="${schema.name}"]` },
      ];
    },
    renderHTML({ HTMLAttributes }) {
      return atom
        ? ["div", { ...HTMLAttributes, "data-te-block": schema.name }]
        : ["div", { ...HTMLAttributes, "data-te-block": schema.name }, 0];
    },
  });
}

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

/** Inline code may sit inside links, bold, italic and strike (e.g. a linked `useUpload`). */
export const InlineCode = Code.extend({ excludes: "" });

/** Headings carry an anchor ID from their text. */
const AnchoredHeading = Heading.extend({
  renderHTML({ node, HTMLAttributes }) {
    const level = this.options.levels.includes(node.attrs.level)
      ? node.attrs.level
      : this.options.levels[0];
    const id =
      typeof node.textContent === "string" ? createId(node.textContent) : undefined;
    return [`h${level}`, { ...HTMLAttributes, id }, 0];
  },
});

export interface ProfileExtensionOptions {
  /**
   * Adds editing behaviour that doesn't change the schema: placeholder,
   * drop and gap cursors, a trailing paragraph, syntax highlighting,
   * resizable tables and link autolinking.
   */
  editing?: boolean;
  placeholder?: string;
}

/** Tiptap extensions for a profile. Server-safe: no React and no node views. */
export function createProfileExtensions(
  profile: Profile,
  { editing = false, placeholder }: ProfileExtensionOptions = {},
): Extensions {
  const node = (name: string) => profile.nodeNames.has(name);
  const mark = (name: string) => profile.marks.includes(name as never);
  const on = (enabled: boolean): {} | false => (enabled ? {} : false);
  const lists = node("bulletList") || node("orderedList");
  const isAllowedUrl = profile.options.isAllowedUrl;
  const simpleTables = profile.options.tables === "simple";

  const extensions: AnyExtension[] = [
    StarterKit.configure({
      document: false,
      code: false,
      codeBlock: false,
      heading: false,
      link: false,
      dropcursor: false,
      gapcursor: false,
      trailingNode: false,
      undoRedo: editing ? {} : false,
      blockquote: on(node("blockquote")),
      bulletList: on(node("bulletList")),
      orderedList: on(node("orderedList")),
      listItem: on(lists),
      listKeymap: on(lists),
      horizontalRule: on(node("horizontalRule")),
      hardBreak: on(node("hardBreak")),
      bold: on(mark("bold")),
      italic: on(mark("italic")),
      strike: on(mark("strike")),
      underline: on(mark("underline")),
    }),
    Node.create({
      name: "doc",
      topNode: true,
      content: profile.options.requireContent ? "block+" : "block*",
    }),
  ];
  if (node("heading"))
    extensions.push(
      AnchoredHeading.configure({ levels: [...profile.headingLevels] as never }),
    );
  if (mark("code")) extensions.push(InlineCode);
  if (mark("highlight")) extensions.push(Highlight);
  if (mark("link"))
    extensions.push(
      Link.configure({
        openOnClick: false,
        // Also makes the mark inclusive; both setups always had it on.
        autolink: true,
        linkOnPaste: true,
        isAllowedUri: (url) =>
          isSafeUrl(url) && (isAllowedUrl ? isAllowedUrl(url, "link") : true),
      }),
    );
  if (node("codeBlock"))
    extensions.push(
      editing && !profile.options.codeBlockFields
        ? CodeBlockLowlight.configure({ lowlight })
        : CodeBlock,
      CodeBlockTitle,
    );
  if (node("table"))
    extensions.push(
      Table.configure({ resizable: editing && !simpleTables }),
      TableRow,
      simpleTables ? TableHeader.extend({ content: "paragraph" }) : TableHeader,
      simpleTables ? TableCell.extend({ content: "paragraph" }) : TableCell,
    );
  for (const schema of profile.blockSchemas.values())
    extensions.push(schema.extension?.({ editing }) ?? createBlockNode(schema));
  if (editing)
    extensions.push(
      Placeholder.configure({ placeholder: placeholder || "Write something…" }),
      Dropcursor.configure({ color: "hsl(var(--foreground))", width: 2 }),
      Gapcursor,
      TrailingNode,
    );
  return extensions;
}

const schemas = new WeakMap<Profile, Schema>();
/** The ProseMirror schema of a profile (cached). */
export function getProfileSchema(profile: Profile): Schema {
  let schema = schemas.get(profile);
  if (!schema) {
    schema = getSchema(createProfileExtensions(profile));
    schemas.set(profile, schema);
  }
  return schema;
}
