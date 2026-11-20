import { formatReference, type FormatReference } from "../core/reference";
import { docsProfile } from "./profile";

/** Where the content format is published (served by every FrontLit site). */
export const CONTENT_FORMAT_URL = "https://frontlit.app/schema/content.v1.json";

export interface ContentFormat extends FormatReference {
  $id: string;
  title: string;
  description: string;
}

/**
 * The Markdown format that articles, product updates and documentation
 * accept through the API and MCP, as data: syntax, every block with its
 * props and an example, and size limits. `schema/content.v1.json` is this,
 * generated (`bun run schema:generate`).
 */
export function contentFormat(): ContentFormat {
  return {
    $id: CONTENT_FORMAT_URL,
    title: "FrontLit content format",
    description:
      "Markdown accepted for articles, product updates and documentation through the FrontLit API and MCP. Blocks are tags on their own lines with literal props.",
    ...formatReference(docsProfile),
  };
}

/**
 * A compact, prose description of the format for an API or MCP field: the
 * syntax rules and one example per block, with a pointer to the full
 * reference. Generated, so new blocks show up without editing tool text.
 */
export function describeContentFormat(): string {
  const format = contentFormat();
  type Block = (typeof format.blocks)[number];
  const props = (block: Block) =>
    block.attributes
      .filter((a) => a.prop)
      .map((a) => `${a.prop}${a.required ? "" : "?"}: ${a.type ?? "string"}`)
      .join("; ");
  const line = (block: Block, parent?: Block) => {
    const list = props(block);
    const where = parent ? ` (inside <${parent.tag}>)` : "";
    const example = parent ? "" : ` Example: ${JSON.stringify(block.example)}`;
    return `- ${block.tag ?? block.name}${where}: ${block.summary}${list ? ` Props (? = optional): ${list}.` : ""}${example}`;
  };
  const blocks = format.blocks
    .flatMap((block) => [
      line(block),
      ...(block.children ?? []).map((child) => line(child, block)),
    ])
    .join("\n");
  const media = format.blocks.some((block) =>
    block.attributes.some((a) => a.type === "media ID"),
  );
  return [
    `Markdown: ${format.markdown.syntax}`,
    "Images and other files are https URLs. To use your own file, upload it first (get_media_upload_signature, then register_media) and use the URL it returns.",
    ...(media ? ["`media` props take the ID that register_media returns."] : []),
    "Blocks:",
    blocks,
    `Every prop, type and limit: ${CONTENT_FORMAT_URL}`,
  ].join("\n");
}
