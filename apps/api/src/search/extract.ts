import type { PageRevisionContent } from "../db/schema";

export interface ExtractedChunk {
  heading: string | null;
  anchor: string | null;
  content: string;
}

const CHUNK_TARGET_WORDS = 300;

/** Blocks with no answerable text of their own (site chrome, forms,
 * third-party embeds, logo strips, bare media). */
const SKIPPED_WIDGETS = new Set([
  "header",
  "footer",
  "embed",
  "email-form",
  "support-form",
  "data-slot",
  "marquee",
  "media",
]);

/** Setting keys that hold links, ids, styling or media, not visible copy. */
const SKIPPED_KEYS =
  /(^id$|Id$|action|url|href|link|icon|color|colour|image|media|alignment|layout|style|radius|variant|size|period|background|padding|font|theme|width|height|target|embed|html|^script$|language)/i;

type TipTapNode = { type?: string; text?: string; content?: TipTapNode[] };

function tiptapText(node: TipTapNode): string {
  if (node.text) return node.text;
  const parts = (node.content ?? []).map(tiptapText).filter(Boolean);
  const blockish = ["doc", "bulletList", "orderedList", "listItem", "blockquote"];
  return parts.join(blockish.includes(node.type ?? "") ? "\n" : " ");
}

function looksLikeCopy(value: string) {
  const text = value.trim();
  if (!text || !/\p{L}/u.test(text)) return false;
  if (/^(https?:|mailto:|tel:|\/|#[0-9a-f]{3,8}$)/i.test(text)) return false;
  return true;
}

function collect(value: unknown, key: string, out: string[]) {
  if (SKIPPED_KEYS.test(key)) return;
  if (typeof value === "string") {
    if (looksLikeCopy(value)) out.push(value.trim());
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collect(item, key, out);
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (record.type === "doc") {
    const text = tiptapText(record as TipTapNode).trim();
    if (text) out.push(text);
    return;
  }
  // Stored settings have sorted keys; read labels before their bodies so an
  // FAQ item is "question, answer" and a plan is "name, price, features".
  const entries = Object.entries(record).sort(([a], [b]) => leadRank(a) - leadRank(b));
  for (const [childKey, child] of entries) collect(child, childKey, out);
}

const LEAD_KEYS = ["title", "name", "question", "label", "heading", "preTitle"];
function leadRank(key: string) {
  const index = LEAD_KEYS.indexOf(key);
  return index === -1 ? LEAD_KEYS.length : index;
}

function words(text: string) {
  return text.split(/\s+/).filter(Boolean);
}

/** Splits text into ~300-word pieces on paragraph boundaries. */
export function splitLongText(text: string, target = CHUNK_TARGET_WORDS): string[] {
  const paragraphs = text.split(/\n+/).filter((p) => p.trim());
  const pieces: string[] = [];
  let buffer: string[] = [];
  let count = 0;
  for (const paragraph of paragraphs) {
    const n = words(paragraph).length;
    if (count && count + n > target) {
      pieces.push(buffer.join("\n"));
      buffer = [];
      count = 0;
    }
    buffer.push(paragraph);
    count += n;
  }
  if (buffer.length) pieces.push(buffer.join("\n"));
  return pieces;
}

/**
 * One chunk per page block (split if long). The block's `title` becomes
 * the chunk heading; every other piece of visible copy (descriptions, FAQ
 * questions and answers, plan features, rich text) becomes its content.
 */
export function extractPageChunks(content: PageRevisionContent): ExtractedChunk[] {
  const chunks: ExtractedChunk[] = [];
  for (const widget of content.layout ?? []) {
    if (SKIPPED_WIDGETS.has(widget.name)) continue;
    const settings = { ...(widget.settings ?? {}) } as Record<string, unknown>;
    const heading =
      typeof settings.title === "string" && settings.title.trim()
        ? settings.title.trim()
        : null;
    delete settings.title;
    const parts: string[] = [];
    collect(settings, "", parts);
    const text = parts.join("\n").trim();
    if (!text && !heading) continue;
    if (!text) {
      chunks.push({ heading: null, anchor: null, content: heading! });
      continue;
    }
    for (const piece of splitLongText(text))
      chunks.push({ heading, anchor: null, content: piece });
  }
  return chunks;
}

/** "Where this chunk sits", indexed and embedded with the chunk so a
 * section's text keeps its page and topic (contextual retrieval). */
export function chunkContext(input: {
  label: string;
  title: string | null;
  section?: string | null;
  summary?: string | null;
}): string {
  const path = [input.label, input.title, input.section].filter(Boolean).join(" › ");
  const summary = input.summary?.replace(/\s+/g, " ").trim().slice(0, 300);
  return summary ? `${path}\n${summary}` : path;
}
