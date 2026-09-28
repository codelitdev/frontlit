import type { TextEditorContentRow } from "../db/schema";
import { slugify } from "../utils/slug";

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
): DocChunk[] {
  if (!content?.content?.length) return [];

  const chunks: DocChunk[] = [];
  let heading: string | null = null;
  let anchor: string | null = null;
  let buffer: string[] = [];

  function flush() {
    const text = buffer.join("\n\n").trim();
    buffer = [];
    if (!text) return;
    chunks.push({ heading, anchor, content: text });
  }

  for (const node of content.content as TipTapNode[]) {
    const text = extractText(node);
    if (!text) continue;

    if (node.type === "heading") {
      flush();
      heading = text;
      anchor = slugify(text);
      continue;
    }

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
      last.heading === chunks[chunks.length - 2].heading
    ) {
      chunks[chunks.length - 2].content += `\n\n${last.content}`;
      chunks.pop();
    }
  }

  return chunks;
}
