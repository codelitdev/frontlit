import type { JSONContent } from "@tiptap/core";
import {
  ContentError,
  DIAGNOSTIC_CODES as CODES,
  diagnostic,
  sortDiagnostics,
  type Diagnostic,
} from "./diagnostics";
import { getProfileSchema } from "./extensions";
import { checkUrlAttr } from "./url-check";
import { codeFor } from "./profile";
import type { AttrSpec, BlockSchema, Profile } from "./types";
import { isSafeUrl } from "./urls";

const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const nullableString = (v: unknown) => v === null || typeof v === "string";
const spec = (
  validate: (v: unknown) => boolean | string,
  extra: Partial<AttrSpec> = {},
): AttrSpec => ({
  default: null,
  validate,
  description: "",
  ...extra,
});

/** Attribute rules of the base nodes and marks. */
function baseAttributes(profile: Profile): Record<string, Record<string, AttrSpec>> {
  const simple = profile.options.tables === "simple";
  const cell = simple
    ? {
        colspan: spec((v) => v === 1),
        rowspan: spec((v) => v === 1),
        colwidth: spec((v) => v === null),
        align: spec((v) => v === null),
      }
    : {
        colspan: spec((v) => Number.isSafeInteger(v) && Number(v) >= 1),
        rowspan: spec((v) => Number.isSafeInteger(v) && Number(v) >= 1),
        colwidth: spec(
          (v) =>
            v === null ||
            (Array.isArray(v) && v.every((n) => n === null || Number.isFinite(n))),
        ),
        align: spec(
          (v) => v === null || v === "left" || v === "center" || v === "right",
        ),
      };
  return {
    heading: {
      level: spec(
        (v) =>
          (Number.isInteger(v) && profile.headingLevels.includes(v as never)) ||
          `Heading level must be one of: ${profile.headingLevels.join(", ")}.`,
      ),
    },
    orderedList: {
      start: spec((v) => Number.isSafeInteger(v) && Number(v) >= 1),
      type: spec((v) => v === null),
    },
    codeBlock: {
      language: spec(
        (v) => v === null || (typeof v === "string" && /^[\w+-]+$/.test(v)),
      ),
      title: spec(nullableString),
    },
    tableCell: cell,
    tableHeader: cell,
    link: {
      href: spec((v) => isSafeUrl(v) || "Link URL is unsafe.", { url: "link" }),
      title: spec(nullableString),
      target: spec((v) => v === null || v === "_blank"),
      rel: spec((v) => v === null || v === "noopener noreferrer nofollow"),
      class: spec((v) => v === null),
    },
  };
}

const attributeTables = new WeakMap<
  Profile,
  Record<string, Record<string, AttrSpec>>
>();
function attributeTable(profile: Profile) {
  let table = attributeTables.get(profile);
  if (!table) {
    table = baseAttributes(profile);
    for (const [name, schema] of profile.blockSchemas) table[name] = schema.attrs;
    attributeTables.set(profile, table);
  }
  return table;
}

export interface ValidateOptions {
  /**
   * The stored version of the document, never one the client sends. Needed
   * for the availability check.
   */
  previous?: unknown;
  /** Blocks that may not be added now, with the reason (e.g. `plan_required`). */
  unavailable?: Record<string, string>;
}

export interface ValidationResult {
  /** Canonical JSON when valid. */
  content?: JSONContent;
  diagnostics: Diagnostic[];
}

/**
 * Counts nodes by type in any JSON-like tree (tolerant: `previous` is stored
 * data). Stops below `maxDepth`, so a deeply nested tree can't overflow the
 * stack; such a tree already fails the structural limits.
 */
function countTypes(
  input: unknown,
  maxDepth: number,
  paths?: Map<string, string[]>,
  path = "content",
) {
  const counts = new Map<string, number>();
  const walk = (node: unknown, at: string, depth = 0) => {
    if (!record(node) || depth > maxDepth) return;
    if (typeof node.type === "string") {
      counts.set(node.type, (counts.get(node.type) ?? 0) + 1);
      if (paths) paths.set(node.type, [...(paths.get(node.type) ?? []), at]);
    }
    if (Array.isArray(node.content))
      node.content.forEach((child, i) => {
        walk(child, `${at}.content[${i}]`, depth + 1);
      });
  };
  walk(input, path);
  return counts;
}

/**
 * Validates a document against a profile: node and mark names, attributes,
 * URLs, block checks, structure and limits. With `unavailable` and
 * `previous`, also refuses an increase in the count of an unavailable block;
 * existing ones stay valid. Never repairs an invalid tree.
 *
 * `input` may be raw JSON text; it is then size-checked before parsing.
 */
export function validateContent(
  profile: Profile,
  input: unknown,
  options: ValidateOptions = {},
): ValidationResult {
  const errors: Diagnostic[] = [];
  const add = (
    code: string,
    message: string,
    fieldPath: string,
    extra: Partial<Diagnostic> = {},
  ) =>
    errors.push(diagnostic(codeFor(profile, code), message, { fieldPath, ...extra }));
  const { limits } = profile;
  if (typeof input === "string") {
    if (new TextEncoder().encode(input).length > limits.bytes) {
      add(CODES.tooLarge, "Document exceeds the size limit.", "content");
      return { diagnostics: errors };
    }
    try {
      input = JSON.parse(input);
    } catch {
      add(CODES.invalidDocument, "Content is not valid JSON.", "content");
      return { diagnostics: errors };
    }
  }
  const schema = getProfileSchema(profile);
  const table = attributeTable(profile);
  let nodes = 0;
  let textBytes = 0;
  function attrs(value: unknown, type: string, path: string) {
    const allowed = table[type];
    if (value !== undefined && !record(value)) {
      add(CODES.invalidDocument, "Attributes must be an object.", path);
      return;
    }
    const given = (value ?? {}) as Record<string, unknown>;
    for (const [key, v] of Object.entries(given)) {
      const check = allowed && Object.hasOwn(allowed, key) ? allowed[key] : undefined;
      if (!check) {
        add(
          CODES.unsupportedAttribute,
          `Unsupported ${type} attribute: ${key}.`,
          `${path}.${key}`,
        );
        continue;
      }
      if (check.url) continue;
      const result = check.validate(v);
      if (result !== true)
        add(
          CODES.invalidDocument,
          typeof result === "string" ? result : `Invalid ${type} attribute: ${key}.`,
          `${path}.${key}`,
        );
    }
    // URL attributes are checked even when absent (a missing src is unsafe).
    for (const [key, check] of Object.entries(allowed ?? {})) {
      if (!check.url) continue;
      const v = Object.hasOwn(given, key) ? given[key] : check.default;
      const result = checkUrlAttr(profile, check, v);
      if (result !== true) add(CODES.unsafeUrl, result, `${path}.${key}`);
    }
  }
  function walk(node: unknown, path: string, depth: number) {
    if (++nodes > limits.nodes || depth > limits.depth) {
      if (nodes === limits.nodes + 1 || depth > limits.depth)
        add(CODES.tooLarge, "Document exceeds structural limits.", path);
      return;
    }
    if (!record(node) || typeof node.type !== "string") {
      add(CODES.invalidDocument, "Expected a document node with a type.", path);
      return;
    }
    if (!profile.nodeNames.has(node.type) || !Object.hasOwn(schema.nodes, node.type)) {
      add(CODES.blockNotAllowed, `Unsupported node: ${node.type}.`, `${path}.type`);
      return;
    }
    for (const key of Object.keys(node)) {
      if (!["type", "attrs", "content", "marks", "text"].includes(key))
        add(
          CODES.unsupportedAttribute,
          `Unsupported node field: ${key}.`,
          `${path}.${key}`,
        );
    }
    if (node.attrs !== undefined || table[node.type])
      attrs(node.attrs, node.type, `${path}.attrs`);
    if (node.type === "text") {
      if (typeof node.text !== "string" || !node.text.length)
        add(CODES.invalidDocument, "Text nodes require nonempty text.", `${path}.text`);
      else textBytes += new TextEncoder().encode(node.text).length;
      if (node.content !== undefined || node.attrs !== undefined)
        add(CODES.invalidDocument, "Text cannot contain children or attributes.", path);
    } else if (node.text !== undefined)
      add(CODES.invalidDocument, "Only text nodes can contain text.", `${path}.text`);
    if (node.marks !== undefined) {
      if (!Array.isArray(node.marks))
        add(CODES.invalidDocument, "Marks must be an array.", `${path}.marks`);
      else {
        const seen = new Set<string>();
        node.marks.forEach((mark, i) => {
          const mp = `${path}.marks[${i}]`;
          if (!record(mark) || typeof mark.type !== "string") {
            add(CODES.invalidDocument, "Invalid mark.", mp);
            return;
          }
          if (
            !profile.marks.includes(mark.type as never) ||
            !Object.hasOwn(schema.marks, mark.type)
          ) {
            add(CODES.markNotAllowed, `Unsupported mark: ${mark.type}.`, `${mp}.type`);
            return;
          }
          if (node.type !== "text" || seen.has(mark.type))
            add(CODES.invalidDocument, "Marks must be unique and applied to text.", mp);
          seen.add(mark.type);
          for (const key of Object.keys(mark))
            if (!["type", "attrs"].includes(key))
              add(
                CODES.unsupportedAttribute,
                `Unsupported mark field: ${key}.`,
                `${mp}.${key}`,
              );
          if (mark.attrs !== undefined || table[mark.type])
            attrs(mark.attrs, mark.type, `${mp}.attrs`);
        });
      }
    }
    if (
      node.type === "heading" &&
      (!record(node.attrs) || !Number.isInteger(node.attrs.level))
    )
      add(CODES.invalidDocument, "Heading level is required.", `${path}.attrs.level`);
    const block = profile.blockSchemas.get(node.type);
    block?.validate?.(node as JSONContent, {
      path,
      profile,
      report: (code, message, fieldPath = path) => add(code, message, fieldPath),
    });
    if (node.content !== undefined) {
      if (!Array.isArray(node.content)) {
        add(CODES.invalidDocument, "Content must be an array.", `${path}.content`);
        return;
      }
      node.content.forEach((child, i) => {
        walk(child, `${path}.content[${i}]`, depth + 1);
      });
    }
    // Check each subtree independently to give the exact failing JSON path.
    if (!errors.some((error) => error.fieldPath?.startsWith(path))) {
      try {
        schema.nodeFromJSON(node).check();
      } catch {
        add(
          CODES.invalidDocument,
          "Invalid child ordering, cardinality, or marks.",
          path,
        );
      }
    }
    if (
      profile.options.tables === "simple" &&
      node.type === "table" &&
      Array.isArray(node.content)
    ) {
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
            CODES.invalidDocument,
            "Simple tables require a rectangular header row followed by body rows.",
            `${path}.content[${i}]`,
          );
      });
    }
  }
  if (!record(input) || input.type !== "doc")
    add(CODES.invalidDocument, "Root must be a doc node.", "content.type");
  else walk(input, "content", 0);
  if (textBytes > limits.bytes)
    add(CODES.tooLarge, "Document exceeds the text size limit.", "content");

  if (options.unavailable && record(input)) {
    const previous = countTypes(options.previous, limits.depth);
    const paths = new Map<string, string[]>();
    const next = countTypes(input, limits.depth, paths);
    for (const [name, reason] of Object.entries(options.unavailable)) {
      const before = previous.get(name) ?? 0;
      const after = next.get(name) ?? 0;
      if (after > before) {
        const label = profile.blockSchemas.get(name)?.tag ?? name;
        add(
          CODES.blockUnavailable,
          `${label} can't be added (${reason}). Existing ones can stay.`,
          paths.get(name)?.[before] ?? "content",
          { reason },
        );
      }
    }
  }
  if (errors.length) return { diagnostics: sortDiagnostics(errors) };
  const normalizers = new Map<string, BlockSchema["normalize"]>();
  for (const [name, block] of profile.blockSchemas)
    if (block.normalize) normalizers.set(name, block.normalize);
  const normalize = (node: JSONContent): JSONContent => {
    const next = normalizers.get(node.type ?? "")?.(node) ?? node;
    return next.content ? { ...next, content: next.content.map(normalize) } : next;
  };
  const content = normalize(schema.nodeFromJSON(input).toJSON() as JSONContent);
  return { content: { ...content, content: content.content ?? [] }, diagnostics: [] };
}

/** Like `validateContent`, but returns the canonical JSON or throws a `ContentError`. */
export function requireContent(
  profile: Profile,
  input: unknown,
  options: ValidateOptions = {},
): JSONContent {
  const result = validateContent(profile, input, options);
  if (!result.content) throw new ContentError(result.diagnostics);
  return result.content;
}
