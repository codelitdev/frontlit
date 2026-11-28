import type { JSONContent } from "@tiptap/core";
import { ContentError, DIAGNOSTIC_CODES as CODES, diagnostic } from "./diagnostics";
import { parseMarkdown, serializeMarkdown } from "./markdown";
import { codeFor } from "./profile";
import type { Profile } from "./types";
import { validateContent } from "./validate";

/** One exact-match replacement, as in `str_replace`. */
export interface TextEdit {
  old_str: string;
  new_str: string;
}

export type TextEditErrorCode = "EDIT_NOT_FOUND" | "EDIT_AMBIGUOUS" | "EDIT_INVALID";

/** An edit that can't be applied. `index` is its position in the request. */
export class TextEditError extends Error {
  constructor(
    readonly code: TextEditErrorCode,
    readonly index: number,
    message: string,
    readonly matches?: number,
  ) {
    super(message);
    this.name = "TextEditError";
  }
}

export const MAX_TEXT_EDITS = 50;

function countMatches(source: string, needle: string): number {
  let count = 0;
  for (let at = source.indexOf(needle); at !== -1; at = source.indexOf(needle, at + 1))
    if (++count > 1) return count;
  return count;
}

/**
 * Applies `edits` in order, each to the result of the previous one. Every
 * `old_str` must be non-empty, differ from its `new_str`, and occur exactly
 * once. All or nothing: the first edit that can't apply throws `TextEditError`.
 */
export function applyTextEdits(source: string, edits: readonly TextEdit[]): string {
  if (!edits.length || edits.length > MAX_TEXT_EDITS)
    throw new TextEditError(
      "EDIT_INVALID",
      0,
      `Send between 1 and ${MAX_TEXT_EDITS} edits.`,
    );
  let text = source;
  edits.forEach(({ old_str, new_str }, index) => {
    if (typeof old_str !== "string" || typeof new_str !== "string" || !old_str)
      throw new TextEditError(
        "EDIT_INVALID",
        index,
        `Edit ${index}: old_str is empty.`,
      );
    if (old_str === new_str)
      throw new TextEditError(
        "EDIT_INVALID",
        index,
        `Edit ${index}: old_str and new_str are the same.`,
      );
    const matches = countMatches(text, old_str);
    if (matches === 0)
      throw new TextEditError(
        "EDIT_NOT_FOUND",
        index,
        `Edit ${index}: old_str was not found. Read the current text again; it must match exactly, including whitespace.`,
      );
    if (matches > 1)
      throw new TextEditError(
        "EDIT_AMBIGUOUS",
        index,
        `Edit ${index}: old_str matches more than once. Add surrounding text so it matches exactly once.`,
        matches,
      );
    const at = text.indexOf(old_str);
    text = text.slice(0, at) + new_str + text.slice(at + old_str.length);
  });
  return text;
}

/** Info string of the fence that holds a block Markdown can't express. */
const RAW_FENCE_INFO = "tiptap";

/** JSON with keys in a fixed order, so the same node always prints the same. */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : item,
  );
}

/** A code block labelled `tiptap` would read back as a raw block. */
function hasRawFenceLabel(node: JSONContent): boolean {
  if (node.type === "codeBlock" && node.attrs?.language === RAW_FENCE_INFO) return true;
  return (node.content ?? []).some(hasRawFenceLabel);
}

function asDoc(content: JSONContent[]): JSONContent {
  return { type: "doc", content };
}

function writesAsMarkdown(profile: Profile, node: JSONContent): boolean {
  if (hasRawFenceLabel(node)) return false;
  try {
    serializeMarkdown(profile, asDoc([node]));
    return true;
  } catch (error) {
    if (error instanceof ContentError) return false;
    throw error;
  }
}

/** The node as validation normalizes it, so printing it again gives the same JSON. */
function normalized(profile: Profile, node: JSONContent): JSONContent {
  return validateContent(profile, asDoc([node])).content?.content?.[0] ?? node;
}

/**
 * Content as editable Markdown: the profile's Markdown, except that any
 * top-level block Markdown can't express exactly (a resized image, a table
 * with merged cells) is written as a fenced `tiptap` block holding its JSON.
 * Content Markdown can fully express prints exactly as `serializeMarkdown`.
 * Read it back with `fromEditableMarkdown`.
 */
export function toEditableMarkdown(profile: Profile, content: unknown): string {
  const nodes = (content as JSONContent | undefined)?.content ?? [];
  if (!nodes.length) return "";
  if (!nodes.some(hasRawFenceLabel)) {
    try {
      return serializeMarkdown(profile, content);
    } catch (error) {
      if (!(error instanceof ContentError)) throw error;
    }
  }
  const parts: string[] = [];
  let run: JSONContent[] = [];
  const flush = () => {
    if (run.length)
      parts.push(serializeMarkdown(profile, asDoc(run)).replace(/\n+$/, ""));
    run = [];
  };
  for (const node of nodes) {
    if (writesAsMarkdown(profile, node)) {
      run.push(node);
      continue;
    }
    flush();
    parts.push(
      `\`\`\`${RAW_FENCE_INFO}\n${stableStringify(normalized(profile, node))}\n\`\`\``,
    );
  }
  flush();
  return `${parts.join("\n\n")}\n`;
}

interface Segment {
  kind: "markdown" | "raw";
  text: string;
  /** Lines before the segment in the whole text. */
  lineOffset: number;
}

const FENCE = /^(`{3,}|~{3,})(.*)$/;

/** Splits editable Markdown at top-level `tiptap` fences, skipping other fenced code. */
function splitRawBlocks(text: string, unclosed: (line: number) => never): Segment[] {
  const lines = text.split("\n");
  const segments: Segment[] = [];
  let start = 0;
  let open: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const fence = FENCE.exec(lines[i]);
    if (open) {
      if (
        fence &&
        fence[1][0] === open[0] &&
        fence[1].length >= open.length &&
        !fence[2].trim()
      )
        open = null;
      continue;
    }
    if (!fence) continue;
    if (fence[1] !== "```" || fence[2].trim() !== RAW_FENCE_INFO) {
      open = fence[1];
      continue;
    }
    const end = lines.findIndex((line, j) => j > i && line === "```");
    // Unclosed, Markdown would read the rest of the document as code.
    if (end === -1) unclosed(i + 1);
    segments.push({
      kind: "markdown",
      text: lines.slice(start, i).join("\n"),
      lineOffset: start,
    });
    segments.push({
      kind: "raw",
      text: lines.slice(i + 1, end).join("\n"),
      lineOffset: i + 1,
    });
    start = end + 1;
    i = end;
  }
  segments.push({
    kind: "markdown",
    text: lines.slice(start).join("\n"),
    lineOffset: start,
  });
  return segments;
}

function readRawBlock(profile: Profile, segment: Segment): JSONContent {
  const located = (code: string, message: string) =>
    diagnostic(codeFor(profile, code), message, { line: segment.lineOffset + 1 });
  let node: unknown;
  try {
    node = JSON.parse(segment.text);
  } catch {
    throw new ContentError([
      located(CODES.invalidDocument, "A tiptap block must hold one JSON node."),
    ]);
  }
  if (!node || typeof node !== "object" || Array.isArray(node))
    throw new ContentError([
      located(CODES.invalidDocument, "A tiptap block must hold one JSON node."),
    ]);
  const result = validateContent(profile, asDoc([node as JSONContent]));
  if (!result.content)
    throw new ContentError(
      result.diagnostics.map((item) => ({ ...item, line: segment.lineOffset + 1 })),
    );
  return result.content.content?.[0] ?? (node as JSONContent);
}

/** Editable Markdown (see `toEditableMarkdown`) back to validated content. */
export function fromEditableMarkdown(profile: Profile, markdown: string): JSONContent {
  const text = markdown.replace(/\r\n?/g, "\n");
  // Checked on the whole text: each segment alone could pass.
  if (new TextEncoder().encode(text).length > profile.limits.bytes)
    throw new ContentError([
      diagnostic(codeFor(profile, CODES.tooLarge), "Markdown exceeds size limit."),
    ]);
  const segments = splitRawBlocks(text, (line) => {
    throw new ContentError([
      diagnostic(
        codeFor(profile, CODES.unsupportedSyntax),
        "A tiptap block is missing its closing ``` line.",
        { line },
      ),
    ]);
  });
  if (segments.length === 1) return parseMarkdown(profile, text);
  const content: JSONContent[] = [];
  for (const segment of segments) {
    if (segment.kind === "raw") {
      content.push(readRawBlock(profile, segment));
      continue;
    }
    if (!segment.text.trim()) continue;
    const parsed = parseMarkdown(profile, segment.text, {
      lineOffset: segment.lineOffset,
    });
    content.push(...(parsed.content ?? []));
  }
  const result = validateContent(profile, asDoc(content));
  if (!result.content) throw new ContentError(result.diagnostics);
  return result.content;
}

/**
 * Applies exact-match `edits` to content through its editable Markdown:
 * `toEditableMarkdown` → `applyTextEdits` → `fromEditableMarkdown`. Throws
 * `TextEditError` for an edit that doesn't apply and `ContentError` when the
 * edited text isn't valid content. Text outside the edits is unchanged.
 */
export function editContent(
  profile: Profile,
  content: unknown,
  edits: readonly TextEdit[],
): JSONContent {
  return fromEditableMarkdown(
    profile,
    applyTextEdits(toEditableMarkdown(profile, content), edits),
  );
}
