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

type TipTapNode = { type?: string; text?: string; content?: TipTapNode[] };

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
  return (node.content ?? [])
    .map(extractDocsText)
    .join(node.type === "paragraph" || node.type === "heading" ? "" : "\n");
}

function docsBlocks(nodes: TipTapNode[]): TipTapNode[] {
  return nodes.flatMap((node) =>
    [
      "blockquote",
      "bulletList",
      "orderedList",
      "listItem",
      "table",
      "tableRow",
      "tableHeader",
      "tableCell",
    ].includes(node.type ?? "")
      ? docsBlocks(node.content ?? [])
      : [node],
  );
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
