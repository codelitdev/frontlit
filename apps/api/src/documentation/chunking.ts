import type { TextEditorContentRow } from "../db/schema";
import { slugify } from "../utils/slug";
import { createHeadingIdGenerator, docsNodeText } from "@frontlit/text-editor/headings";

export interface DocChunk {
  heading: string | null;
  anchor: string | null;
  content: string;
}

const CHUNK_TARGET_WORDS = 300;
const MIN_CHUNK_WORDS = 20;

type TipTapNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, any>;
  content?: TipTapNode[];
};

/** Plain text of one TipTap node, its marks/attrs ignored \u2014 chunking only
 * needs the words, not formatting. */
function extractText(node: TipTapNode): string {
  if (node.text) return node.text;
  if (!node.content) return "";
  return node.content.map(extractText).join(" ").replace(/\s+/g, " ").trim();
}

function extractDocsText(node: TipTapNode): string {
  if (node.text) return node.text;
  if (node.type === "hardBreak") return "\n";
  if (node.type === "typeTable")
    return (node.attrs?.rows ?? [])
      .map((row: Record<string, unknown>) =>
        [row.name, row.type, row.default, row.description].filter(Boolean).join(" "),
      )
      .join("\n");
  const children = (node.content ?? []).map(extractDocsText);
  // A card's title is an attribute; its children are the description.
  if (node.type === "card") children.unshift(node.attrs?.title ?? "");
  return children.join(
    node.type === "paragraph" || node.type === "heading" ? "" : "\n",
  );
}

/** Blocks whose children are read as top-level blocks, so their headings start chunks. */
const CONTAINERS = [
  "blockquote",
  "bulletList",
  "orderedList",
  "listItem",
  "table",
  "tableRow",
  "tableHeader",
  "tableCell",
  "callout",
  "tabs",
  "tab",
  "steps",
  "step",
  "cards",
  "accordions",
  "accordion",
  "codeGroup",
];

function docsBlocks(nodes: TipTapNode[]): TipTapNode[] {
  return nodes.flatMap((node) => {
    if (!CONTAINERS.includes(node.type ?? "")) return [node];
    // Callout and accordion titles and tab labels are attributes; keep them searchable.
    const label = node.attrs?.title ?? node.attrs?.label;
    return [
      ...(typeof label === "string" && label
        ? [{ type: "paragraph", content: [{ text: label }] }]
        : []),
      ...docsBlocks(node.content ?? []),
    ];
  });
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Splits a document's TipTap JSON at heading nodes into ~200\u2013500-word
 * chunks (architecture.md §6.3), so each chunk carries the heading/anchor
 * of the section it came from (used for citations and #fragment links).
 * A section longer than the target size is itself split into multiple
 * chunks, all still attributed to that heading.
 */
export function extractChunks(
  content: TextEditorContentRow | null | undefined,
  kind: "doc" | "blog" | "changelog" = "doc",
): DocChunk[] {
  if (!content?.content?.length) return [];

  const chunks: DocChunk[] = [];
  let heading: string | null = null;
  let anchor: string | null = null;
  let buffer: string[] = [];
  const nextHeadingId = createHeadingIdGenerator();

  function flush() {
    const text = buffer.join("\n\n").trim();
    buffer = [];
    if (!text) return;
    chunks.push({ heading, anchor, content: text });
  }

  const nodes =
    kind === "doc"
      ? docsBlocks(content.content as TipTapNode[])
      : (content.content as TipTapNode[]);
  for (const node of nodes) {
    const text =
      node.type === "heading" && kind === "doc"
        ? docsNodeText(node)
        : kind === "doc"
          ? extractDocsText(node)
          : extractText(node);

    if (node.type === "heading") {
      flush();
      heading = text;
      anchor = kind === "doc" ? nextHeadingId(text) : slugify(text);
      continue;
    }

    if (!text) continue;

    buffer.push(text);
    if (wordCount(buffer.join(" ")) >= CHUNK_TARGET_WORDS) flush();
  }
  flush();

  // Merge a trailing sliver into the previous chunk rather than shipping
  // a near-empty embedding.
  if (chunks.length > 1) {
    const last = chunks[chunks.length - 1];
    if (
      wordCount(last.content) < MIN_CHUNK_WORDS &&
      last.heading === chunks[chunks.length - 2].heading &&
      last.anchor === chunks[chunks.length - 2].anchor
    ) {
      chunks[chunks.length - 2].content += `\n\n${last.content}`;
      chunks.pop();
    }
  }

  return chunks;
}
