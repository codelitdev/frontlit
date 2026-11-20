import type { AnyExtension, JSONContent } from "@tiptap/core";
import type { Nodes, RootContent } from "mdast";
import type { MdxJsxAttribute, MdxJsxFlowElement } from "mdast-util-mdx-jsx";
import type { Diagnostic } from "./diagnostics";

/**
 * Result of an attribute check: `true` when valid, otherwise `false` or a
 * message for the author.
 */
export type AttrCheck = boolean | string;

export interface AttrSpec<T = unknown> {
  /** Value used when the attribute is absent. */
  default: T;
  /** Checks a value from JSON or Markdown. Runs on the server; keep it pure. */
  validate(value: unknown): AttrCheck;
  /** One sentence for the format reference. */
  description: string;
  /** Type shown in the format reference, e.g. `string`, `"note" | "tip"`. */
  type?: string;
  /** Markdown prop name when it differs from the attribute name. */
  prop?: string;
  /** Markdown requires the prop. */
  required?: boolean;
  /** Not written to or read from Markdown props (a custom form handles it). */
  markdown?: false;
  /**
   * A URL: a failed check reports `unsafe_url`, and the profile's
   * `isAllowedUrl` policy also applies. `image` for image sources.
   */
  url?: "link" | "image";
}

export type AttrSpecs<Attrs = Record<string, unknown>> = {
  [K in keyof Attrs]: AttrSpec<Attrs[K]>;
};

export interface MarkdownReadContext {
  /** Literal props, checked against `schema.attrs`, with defaults filled in. */
  attrs(element: MdxJsxFlowElement, schema: BlockSchema): Record<string, unknown>;
  /** Literal props without attribute checks (for custom forms); refuses props outside `allowed`. */
  props(element: MdxJsxFlowElement, allowed: string[]): Record<string, unknown>;
  /** Converts Markdown flow children to block nodes. */
  blocks(children: RootContent[]): JSONContent[];
  /** Converts a child tag that belongs to this block (e.g. `<Tab>` in `<Tabs>`). */
  child(element: MdxJsxFlowElement, parent: BlockSchema): JSONContent;
  /** Child elements of a tag, refusing anything but the given tags. */
  elements(element: MdxJsxFlowElement, tags: string[]): MdxJsxFlowElement[];
  /** Throws a located diagnostic. `code` is a generic code (see DIAGNOSTIC_CODES). */
  fail(node: Nodes, message: string, code?: string): never;
}

export interface MarkdownWriteContext {
  /** Converts block nodes to Markdown flow content. */
  blocks(nodes: JSONContent[]): RootContent[];
  /** A string prop, or an expression prop (`name={…}`) when `expression` is set. */
  prop(name: string, value: unknown, expression?: boolean): MdxJsxAttribute | undefined;
  /** Writes a JS literal (strings, numbers, booleans, null, arrays, objects). */
  literal(value: unknown): string;
  /** Props from attrs, in spec order, skipping null and undefined. */
  props(schema: BlockSchema, attrs: Record<string, unknown>): MdxJsxAttribute[];
  element(
    name: string,
    attributes: (MdxJsxAttribute | undefined)[],
    children?: RootContent[],
  ): MdxJsxFlowElement;
}

export interface ValidateContext {
  /** JSON path of the node. */
  path: string;
  profile: Profile;
  /** Adds a diagnostic with a generic code. */
  report(code: string, message: string, fieldPath?: string): void;
}

/**
 * A block described once, server-safe (no React). Every layer — schema,
 * Markdown, validation, format reference — is built from it.
 */
export interface BlockSchema<Attrs = Record<string, unknown>> {
  /** Tiptap node name, e.g. `video`. */
  name: string;
  /**
   * Markdown tag, e.g. `Video`. Absent only for blocks whose Markdown form is
   * built in (an Image without media IDs is `![alt](src)`).
   */
  tag?: string;
  /** Child content expression; the node is an atom when absent. */
  content?: string;
  /** Schema group; `block` for top-level blocks. Child nodes have none. */
  group?: string;
  attrs: AttrSpecs<Attrs>;
  /**
   * Nodes owned by this block that only appear inside it (`tab` in `tabs`).
   * They are added and removed with the block.
   */
  children?: BlockSchema[];
  /** Custom Markdown form (e.g. nested tags). Defaults to a tag with literal props. */
  toMarkdown?(node: JSONContent, ctx: MarkdownWriteContext): RootContent;
  fromMarkdown?(element: MdxJsxFlowElement, ctx: MarkdownReadContext): JSONContent;
  /** Extra checks on a JSON node; attribute validators already ran. */
  validate?(node: JSONContent, ctx: ValidateContext): void;
  /** Canonical form after validation (e.g. fixed key order inside an attribute). */
  normalize?(node: JSONContent): JSONContent;
  /** A server-safe Tiptap extension to use instead of the generated node. */
  extension?(options: { editing: boolean }): AnyExtension;
  /** Feeds the format reference for API and MCP descriptions. */
  docs: { summary: string; example: string };
}

export interface ProfileLimits {
  /** Byte cap on raw Markdown or JSON before parsing, and on document text. */
  bytes: number;
  nodes: number;
  depth: number;
}

export const DEFAULT_LIMITS: ProfileLimits = {
  bytes: 1024 * 1024,
  nodes: 20000,
  depth: 64,
};

/** Base nodes that can be removed. Children go with their parents. */
export const BASE_NODES = [
  "heading",
  "blockquote",
  "bulletList",
  "orderedList",
  "codeBlock",
  "horizontalRule",
  "hardBreak",
  "table",
] as const;
export type BaseNode = (typeof BASE_NODES)[number];
export const BASE_MARKS = [
  "bold",
  "italic",
  "strike",
  "code",
  "underline",
  "highlight",
  "link",
] as const;
export type BaseMark = (typeof BASE_MARKS)[number];
export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface ProfileOptions {
  /**
   * `simple`: one paragraph per cell, a header row, no merged cells (what
   * Markdown can hold). `rich`: any blocks in cells, resizable columns.
   */
  tables?: "simple" | "rich";
  /** The document needs at least one block (`block+`). Default: false (`block*`). */
  requireContent?: boolean;
  /** Renames generic diagnostic codes, e.g. `{ block_not_allowed: "UNSUPPORTED_NODE" }`. */
  diagnosticCodes?: Partial<Record<string, string>>;
  /** Host URL policy on top of the built-in rules. */
  isAllowedUrl?(url: string, kind: "link" | "image"): boolean;
  /** Blocks offered in the insert menus; all listed blocks when absent. */
  menu?: string[];
  /** Code blocks show file name and language fields in the editor. */
  codeBlockFields?: boolean;
  /** Name used for profile-specific behaviour in the editor and renderer. */
  name?: string;
}

export interface ProfileDefinition {
  base?: {
    exclude?: string[];
    headings?: { levels?: HeadingLevel[] };
    marks?: { exclude?: string[] };
  };
  /** Library or host blocks. Browser `BlockUi` objects are accepted too. */
  blocks?: (BlockSchema | { schema: BlockSchema })[];
  limits?: Partial<ProfileLimits>;
  options?: ProfileOptions;
}

export interface Profile {
  readonly kind: "frontlit.profile";
  /** Base nodes kept (parents only). */
  readonly baseNodes: readonly BaseNode[];
  readonly marks: readonly BaseMark[];
  readonly headingLevels: readonly HeadingLevel[];
  /** Listed blocks, in order. */
  readonly blocks: readonly BlockSchema[];
  /** Every node name the format holds, including `doc`, `text` and child nodes. */
  readonly nodeNames: ReadonlySet<string>;
  /** Block and child schemas by node name. */
  readonly blockSchemas: ReadonlyMap<string, BlockSchema>;
  /** Block and child schemas by Markdown tag. */
  readonly tags: ReadonlyMap<string, { schema: BlockSchema; parent?: BlockSchema }>;
  readonly limits: ProfileLimits;
  readonly options: Readonly<ProfileOptions>;
  /** Browser UI passed in through `blocks` (BlockUi objects), by block name. */
  readonly ui: ReadonlyMap<string, unknown>;
}

export type { Diagnostic };
