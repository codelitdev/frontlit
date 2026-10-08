import type { JSONContent } from "@tiptap/core";
import { docsSchema } from "./extensions";
import {
  diagnostic,
  DocsContentError,
  sortDiagnostics,
  type DocsDiagnostic,
} from "./diagnostics";
import { isSafeDocsUrl } from "./urls";

export const DOCS_LIMITS = {
  bytes: 1024 * 1024,
  nodes: 20000,
  depth: 64,
  metadataBytes: 32768,
} as const;
const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const nullableString = (v: unknown) => v === null || typeof v === "string";
const attributes: Record<string, Record<string, (v: unknown) => boolean>> = {
  heading: { level: (v) => Number.isInteger(v) && Number(v) >= 1 && Number(v) <= 6 },
  orderedList: {
    start: (v) => Number.isSafeInteger(v) && Number(v) >= 1,
    type: (v) => v === null,
  },
  codeBlock: {
    language: (v) => v === null || (typeof v === "string" && /^[\w+-]+$/.test(v)),
  },
  image: {
    src: (v) => typeof v === "string",
    alt: nullableString,
    title: nullableString,
    width: (v) => v === null,
    height: (v) => v === null,
  },
  tableCell: {
    colspan: (v) => v === 1,
    rowspan: (v) => v === 1,
    colwidth: (v) => v === null,
    align: (v) => v === null,
  },
  tableHeader: {
    colspan: (v) => v === 1,
    rowspan: (v) => v === 1,
    colwidth: (v) => v === null,
    align: (v) => v === null,
  },
  link: {
    href: (v) => typeof v === "string",
    title: nullableString,
    target: (v) => v === null || v === "_blank",
    rel: (v) => v === null || v === "noopener noreferrer nofollow",
    class: (v) => v === null,
  },
};

/** Checks before ProseMirror can discard unknown keys. Never repairs supplied invalid trees. */
export function validateDocsContent(input: unknown): {
  content?: JSONContent;
  diagnostics: DocsDiagnostic[];
} {
  const errors: DocsDiagnostic[] = [];
  const add = (code: string, message: string, fieldPath: string) =>
    errors.push(diagnostic(code, message, { fieldPath }));
  let nodes = 0;
  let textBytes = 0;
  function attrs(value: unknown, type: string, path: string) {
    if (value === undefined) return;
    if (!record(value)) {
      add("INVALID_DOCUMENT", "Attributes must be an object.", path);
      return;
    }
    for (const [key, v] of Object.entries(value)) {
      const allowed = attributes[type];
      const check = allowed && Object.hasOwn(allowed, key) ? allowed[key] : undefined;
      if (!check)
        add(
          "UNSUPPORTED_ATTRIBUTE",
          `Unsupported ${type} attribute: ${key}.`,
          `${path}.${key}`,
        );
      else if (!check(v))
        add("INVALID_DOCUMENT", `Invalid ${type} attribute: ${key}.`, `${path}.${key}`);
    }
  }
  function walk(node: unknown, path: string, depth: number) {
    if (++nodes > DOCS_LIMITS.nodes || depth > DOCS_LIMITS.depth) {
      if (nodes === DOCS_LIMITS.nodes + 1 || depth > DOCS_LIMITS.depth)
        add("INVALID_DOCUMENT", "Document exceeds structural limits.", path);
      return;
    }
    if (!record(node) || typeof node.type !== "string") {
      add("INVALID_DOCUMENT", "Expected a document node with a type.", path);
      return;
    }
    if (!Object.hasOwn(docsSchema.nodes, node.type)) {
      add("UNSUPPORTED_NODE", `Unsupported node: ${node.type}.`, `${path}.type`);
      return;
    }
    for (const key of Object.keys(node)) {
      if (!["type", "attrs", "content", "marks", "text"].includes(key))
        add(
          "UNSUPPORTED_ATTRIBUTE",
          `Unsupported node field: ${key}.`,
          `${path}.${key}`,
        );
    }
    attrs(node.attrs, node.type, `${path}.attrs`);
    if (node.type === "text") {
      if (typeof node.text !== "string" || !node.text.length)
        add("INVALID_DOCUMENT", "Text nodes require nonempty text.", `${path}.text`);
      else textBytes += new TextEncoder().encode(node.text).length;
      if (node.content !== undefined || node.attrs !== undefined)
        add("INVALID_DOCUMENT", "Text cannot contain children or attributes.", path);
    } else if (node.text !== undefined)
      add("INVALID_DOCUMENT", "Only text nodes can contain text.", `${path}.text`);
    if (node.marks !== undefined) {
      if (!Array.isArray(node.marks))
        add("INVALID_DOCUMENT", "Marks must be an array.", `${path}.marks`);
      else {
        const seen = new Set<string>();
        node.marks.forEach((mark, i) => {
          const mp = `${path}.marks[${i}]`;
          if (!record(mark) || typeof mark.type !== "string") {
            add("INVALID_DOCUMENT", "Invalid mark.", mp);
            return;
          }
          if (!Object.hasOwn(docsSchema.marks, mark.type)) {
            add("UNSUPPORTED_MARK", `Unsupported mark: ${mark.type}.`, `${mp}.type`);
            return;
          }
          if (node.type !== "text" || seen.has(mark.type))
            add("INVALID_DOCUMENT", "Marks must be unique and applied to text.", mp);
          seen.add(mark.type);
          for (const key of Object.keys(mark))
            if (!["type", "attrs"].includes(key))
              add(
                "UNSUPPORTED_ATTRIBUTE",
                `Unsupported mark field: ${key}.`,
                `${mp}.${key}`,
              );
          attrs(mark.attrs, mark.type, `${mp}.attrs`);
          if (
            mark.type === "link" &&
            (!record(mark.attrs) || !isSafeDocsUrl(mark.attrs.href))
          )
            add("UNSAFE_URL", "Link URL is unsafe.", `${mp}.attrs.href`);
        });
        if (seen.has("code") && seen.size > 1)
          add(
            "INVALID_DOCUMENT",
            "Inline code cannot carry other marks.",
            `${path}.marks`,
          );
      }
    }
    if (
      node.type === "image" &&
      (!record(node.attrs) || !isSafeDocsUrl(node.attrs.src, true))
    )
      add("UNSAFE_URL", "Images require a stable HTTPS URL.", `${path}.attrs.src`);
    if (
      node.type === "heading" &&
      (!record(node.attrs) || !Number.isInteger(node.attrs.level))
    )
      add("INVALID_DOCUMENT", "Heading level is required.", `${path}.attrs.level`);
    if (node.content !== undefined) {
      if (!Array.isArray(node.content)) {
        add("INVALID_DOCUMENT", "Content must be an array.", `${path}.content`);
        return;
      }
      node.content.forEach((child, i) => {
        walk(child, `${path}.content[${i}]`, depth + 1);
      });
    }
    // Check each subtree independently to give the exact failing JSON path.
    if (!errors.some((error) => error.fieldPath?.startsWith(path))) {
      try {
        docsSchema.nodeFromJSON(node).check();
      } catch {
        add("INVALID_DOCUMENT", "Invalid child ordering, cardinality, or marks.", path);
      }
    }
    if (node.type === "table" && Array.isArray(node.content)) {
      let width: number | undefined;
      node.content.forEach((row, i) => {
        if (!record(row) || !Array.isArray(row.content)) return;
        width ??= row.content.length;
        if (
          row.content.length !== width ||
          row.content.some(
            (cell) =>
              !record(cell) || cell.type !== (i === 0 ? "tableHeader" : "tableCell"),
          )
        )
          add(
            "INVALID_DOCUMENT",
            "Simple tables require a rectangular header row followed by body rows.",
            `${path}.content[${i}]`,
          );
      });
    }
  }
  if (!record(input) || input.type !== "doc")
    add("INVALID_DOCUMENT", "Root must be a doc node.", "content.type");
  else walk(input, "content", 0);
  if (textBytes > DOCS_LIMITS.bytes)
    add("INVALID_DOCUMENT", "Document exceeds the text size limit.", "content");
  if (errors.length) return { diagnostics: sortDiagnostics(errors) };
  const normalize = (node: JSONContent): JSONContent => ({
    ...node,
    ...(node.type === "image"
      ? { attrs: { ...node.attrs, alt: node.attrs?.alt ?? "" } }
      : {}),
    ...(node.content ? { content: node.content.map(normalize) } : {}),
  });
  // Missing and empty alt text both lack a description; retain this as an
  // empty string so Markdown can represent the image without blocking a draft.
  const content = normalize(docsSchema.nodeFromJSON(input).toJSON() as JSONContent);
  return { content: { ...content, content: content.content ?? [] }, diagnostics: [] };
}

export function requireDocsContent(input: unknown): JSONContent {
  const result = validateDocsContent(input);
  if (!result.content) throw new DocsContentError(result.diagnostics);
  return result.content;
}
