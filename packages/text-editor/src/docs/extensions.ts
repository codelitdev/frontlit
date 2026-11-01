import { getSchema, Node, type Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import CodeBlock from "@tiptap/extension-code-block";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { isSafeDocsUrl } from "./urls";
import { CodeBlockTitle, createDocsBlockExtensions } from "./blocks";
import type { Schema } from "@tiptap/pm/model";

/** DM-VALIDATE: schema-only extensions; no React, upload controls, or node views. */
export function createDocsExtensions(): Extensions {
  return [
    StarterKit.configure({
      code: false,
      codeBlock: false,
      document: false,
      underline: false,
      link: false,
      dropcursor: false,
      gapcursor: false,
      trailingNode: false,
    }),
    Node.create({ name: "doc", topNode: true, content: "block*" }),
    Link.extend({
      addAttributes() {
        return { ...this.parent?.(), title: { default: null } };
      },
    }).configure({ openOnClick: false, isAllowedUri: (url) => isSafeDocsUrl(url) }),
    Image.configure({ allowBase64: false, resize: false }),
    Table.configure({ resizable: false }),
    TableRow,
    TableCell.extend({ content: "paragraph" }),
    TableHeader.extend({ content: "paragraph" }),
    CodeBlock,
    CodeBlockTitle,
    ...createDocsBlockExtensions(),
  ];
}

export const docsSchema: Schema = getSchema(createDocsExtensions());
export const DOCS_SCHEMA_VERSION = 1;
