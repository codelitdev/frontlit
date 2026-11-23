export const DOCS_HEADING_POLICY_VERSION = 1;

export interface HeadingNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: HeadingNode[];
}

export function docsNodeText(node: HeadingNode): string {
  if (typeof node.text === "string") return node.text;
  if (node.type === "hardBreak") return "\n";
  return (node.content ?? []).map(docsNodeText).join("");
}

/** DM-CONVERT: deterministic Unicode anchors, including duplicate-base collisions. */
export function createHeadingIdGenerator(): (text: string) => string {
  const used = new Set<string>();
  return (text) => {
    const base =
      text
        .normalize("NFKC")
        .toLowerCase()
        .trim()
        .replace(/[^\p{L}\p{N}\s_-]/gu, "")
        .replace(/\s+/g, "-") || "section";
    let id = base;
    let suffix = 2;
    while (used.has(id)) id = `${base}-${suffix++}`;
    used.add(id);
    return id;
  };
}

export function extractDocsHeadings(json: HeadingNode | null | undefined) {
  const nextId = createHeadingIdGenerator();
  const headings: { level: number; text: string; id: string }[] = [];
  function walk(node: HeadingNode) {
    if (node.type === "heading") {
      const text = docsNodeText(node);
      headings.push({ level: Number(node.attrs?.level ?? 1), text, id: nextId(text) });
    }
    for (const child of node.content ?? []) walk(child);
  }
  if (json) walk(json);
  return headings;
}
