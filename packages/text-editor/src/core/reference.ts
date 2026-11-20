import type { BlockSchema, Profile } from "./types";

export interface AttributeReference {
  name: string;
  /** Markdown prop name; absent when the attribute isn't written as a prop. */
  prop?: string;
  type?: string;
  default: unknown;
  required: boolean;
  description: string;
}

export interface BlockReference {
  name: string;
  tag?: string;
  summary: string;
  example: string;
  /** Child content expression; absent for atoms. */
  content?: string;
  attributes: AttributeReference[];
  children?: BlockReference[];
  /** Present when the block may not be added now. */
  unavailable?: string;
}

export interface FormatReference {
  markdown: {
    syntax: string;
    marks: string[];
    nodes: string[];
    headingLevels: number[];
  };
  blocks: BlockReference[];
  limits: { bytes: number; nodes: number; depth: number };
}

const NODE_SYNTAX: Record<string, string> = {
  heading: "# Heading",
  blockquote: "> Quote",
  bulletList: "- Item",
  orderedList: "1. Item",
  codeBlock: '```lang title="file.ts"',
  horizontalRule: "---",
  hardBreak: "Two trailing spaces",
  table: "| GFM | table |",
};
const MARK_SYNTAX: Record<string, string> = {
  bold: "**bold**",
  italic: "*italic*",
  strike: "~~strike~~",
  code: "`code`",
  link: "[text](https://… or /path or mailto:…)",
};

function describe(
  block: BlockSchema,
  unavailable?: Record<string, string>,
): BlockReference {
  return {
    name: block.name,
    ...(block.tag ? { tag: block.tag } : {}),
    summary: block.docs.summary,
    example: block.docs.example,
    ...(block.content ? { content: block.content } : {}),
    attributes: Object.entries(block.attrs).map(([name, spec]) => ({
      name,
      ...(spec.markdown === false ? {} : { prop: spec.prop ?? name }),
      ...(spec.type ? { type: spec.type } : {}),
      default: spec.default,
      required: Boolean(spec.required),
      description: spec.description,
    })),
    ...(block.children?.length
      ? { children: block.children.map((child) => describe(child)) }
      : {}),
    ...(unavailable && Object.hasOwn(unavailable, block.name)
      ? { unavailable: unavailable[block.name] }
      : {}),
  };
}

/**
 * A machine-readable reference of what a profile's Markdown can hold, for API
 * and MCP descriptions. Built from each block's `docs` and attributes.
 */
export function formatReference(
  profile: Profile,
  { unavailable }: { unavailable?: Record<string, string> } = {},
): FormatReference {
  return {
    markdown: {
      syntax:
        "CommonMark with GFM tables. Rich blocks are JSX-style tags on their own lines with literal props only; raw HTML, expressions and imports are refused.",
      marks: profile.marks.flatMap((mark) =>
        MARK_SYNTAX[mark] ? [MARK_SYNTAX[mark]] : [],
      ),
      nodes: profile.baseNodes.map((node) => NODE_SYNTAX[node]),
      headingLevels: [...profile.headingLevels],
    },
    blocks: profile.blocks.map((block) => describe(block, unavailable)),
    limits: { ...profile.limits },
  };
}
