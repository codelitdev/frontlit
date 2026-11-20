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
  const props = (block: (typeof format.blocks)[number]) =>
    block.attributes
      .filter((a) => a.prop)
      .map((a) => `${a.prop}${a.required ? "" : "?"}: ${a.type ?? "string"}`)
      .join("; ");
  const blocks = format.blocks
    .map((block) => {
      const list = props(block);
      return `- ${block.tag ?? block.name}: ${block.summary}${list ? ` Props: ${list}.` : ""} Example: ${JSON.stringify(block.example)}`;
    })
    .join("\n");
  return [
    `Markdown: ${format.markdown.syntax}`,
    "Blocks:",
    blocks,
    `Every prop, type and limit: ${CONTENT_FORMAT_URL}`,
  ].join("\n");
}
