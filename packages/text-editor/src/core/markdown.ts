import type { JSONContent } from "@tiptap/core";
import type { Definition, Nodes, PhrasingContent, Root, RootContent } from "mdast";
import { unified, type Processor } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkStringify from "remark-stringify";
import { mdxJsx } from "micromark-extension-mdx-jsx";
import {
  mdxJsxFromMarkdown,
  mdxJsxToMarkdown,
  type MdxJsxAttribute,
  type MdxJsxExpressionAttribute,
  type MdxJsxFlowElement,
} from "mdast-util-mdx-jsx";
import { ContentError, DIAGNOSTIC_CODES as CODES, diagnostic } from "./diagnostics";
import { getProfileSchema } from "./extensions";
import { evaluateLiteral, writeLiteral } from "./literal";
import { codeFor } from "./profile";
import type {
  AttrSpec,
  BlockSchema,
  MarkdownReadContext,
  MarkdownWriteContext,
  Profile,
} from "./types";
import { requireContent } from "./validate";
import { isSafeUrl } from "./urls";
import { checkUrlAttr } from "./url-check";

/** Rich blocks are MDX-style JSX tags. Only the tag syntax is enabled: braces in prose stay text. */
function jsxTags(this: Processor) {
  const data = this.data();
  data.micromarkExtensions = [...(data.micromarkExtensions ?? []), mdxJsx()];
  data.fromMarkdownExtensions = [
    ...(data.fromMarkdownExtensions ?? []),
    mdxJsxFromMarkdown(),
  ];
  data.toMarkdownExtensions = [
    ...(data.toMarkdownExtensions ?? []),
    mdxJsxToMarkdown(),
    // The stock handler indents children, which turns nested fences into indented code.
    { handlers: { mdxJsxFlowElement: writeComponent as never } },
  ];
}
/** Children stay unindented, between blank lines, so code fences inside keep their meaning. */
function writeComponent(
  node: MdxJsxFlowElement,
  _parent: unknown,
  state: { containerFlow(parent: MdxJsxFlowElement, info: unknown): string },
  info: unknown,
): string {
  const props = node.attributes.map((attribute) => {
    const { name, value } = attribute as MdxJsxAttribute;
    if (value === null || value === undefined) return name;
    if (typeof value === "string")
      return `${name}="${value.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`;
    return `${name}={${value.value}}`;
  });
  // Multi-line props (a type table) go one per line, as people write them by hand.
  const multiline = props.some((item) => item.includes("\n"));
  const open = multiline
    ? `<${node.name}\n${props.map((item) => `  ${item}`).join("\n")}\n`
    : `<${node.name}${props.map((item) => ` ${item}`).join("")}`;
  if (!node.children.length) return `${open}${multiline ? "" : " "}/>`;
  const body = state.containerFlow(node, info);
  return `${open}>\n\n${body}\n\n</${node.name}>`;
}

/** As in MDX, indentation inside components is layout, not an indented code block. */
function noIndentedCode(this: Processor) {
  const data = this.data();
  data.micromarkExtensions = [
    ...(data.micromarkExtensions ?? []),
    { disable: { null: ["codeIndented"] } },
  ];
}
const parser = unified().use(remarkParse).use(remarkGfm);
const componentParser = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(jsxTags)
  .use(noIndentedCode);
const writer = unified().use(remarkGfm).use(jsxTags).use(remarkStringify, {
  bullet: "-",
  emphasis: "*",
  strong: "*",
  fences: true,
  incrementListMarker: true,
  resourceLink: true,
});

const CODE_TITLE = /^title=(?:"([^"\n]+)"|'([^'\n]+)')$/;
const tagPatterns = new WeakMap<Profile, RegExp | null>();
function tagPattern(profile: Profile): RegExp | null {
  if (!tagPatterns.has(profile)) {
    const tags = [...profile.tags.keys()];
    tagPatterns.set(
      profile,
      tags.length ? new RegExp(`<\\/?(?:${tags.join("|")})\\b`) : null,
    );
  }
  return tagPatterns.get(profile) ?? null;
}

type Place = { line: number; column: number } | undefined;

/** Files that use a block tag follow MDX rules; all others stay plain CommonMark. */
function parseTree(
  profile: Profile,
  body: string,
  fail: (place: Place, message: string) => never,
): Root {
  const pattern = tagPattern(profile);
  if (!pattern?.test(body)) return parser.parse(body);
  try {
    return componentParser.parse(body);
  } catch (cause) {
    const {
      line,
      column,
      reason = String(cause),
    } = cause as {
      line?: number;
      column?: number;
      reason?: string;
    };
    // Unclosed-tag errors carry their position only in the message: "(1:1-1:10)".
    const place = /\((\d+):(\d+)-/.exec(reason);
    return fail(
      line
        ? { line, column: column ?? 1 }
        : place
          ? { line: Number(place[1]), column: Number(place[2]) }
          : undefined,
      `Invalid component syntax: ${reason}`,
    );
  }
}

type Mark = NonNullable<JSONContent["marks"]>[number];

export interface ParseMarkdownOptions {
  /** File name for diagnostics. */
  file?: string;
  /** Lines before the body (e.g. frontmatter), added to diagnostic lines. */
  lineOffset?: number;
}

const LINK_SPEC: AttrSpec = {
  default: null,
  url: "link",
  validate: () => true,
  description: "",
};

/**
 * Markdown (CommonMark + GFM tables, plus the profile's block tags) to Tiptap
 * JSON. Parsed as data: raw HTML, JSX expressions, imports and anything the
 * profile doesn't hold fail closed with a located diagnostic.
 */
export function parseMarkdown(
  profile: Profile,
  markdown: string,
  options: ParseMarkdownOptions = {},
): JSONContent {
  const offset = options.lineOffset ?? 0;
  const located = (code: string, message: string, place?: Place) =>
    diagnostic(codeFor(profile, code), message, {
      file: options.file,
      line: place ? place.line + offset : undefined,
      column: place?.column,
    });
  if (
    typeof markdown !== "string" ||
    new TextEncoder().encode(markdown).length > profile.limits.bytes
  )
    throw new ContentError([located(CODES.tooLarge, "Markdown exceeds size limit.")]);
  const body = markdown.replace(/\r\n?/g, "\n");
  const tree = parseTree(profile, body, (place, message) => {
    throw new ContentError([located(CODES.unsupportedSyntax, message, place)]);
  });
  const definitions = new Map<string, Definition>();
  function fail(
    node: Nodes,
    message: string,
    code: string = CODES.unsupportedSyntax,
  ): never {
    throw new ContentError([
      located(code, message, node.position ? node.position.start : undefined),
    ]);
  }
  let count = 0;
  function inspect(node: Nodes, depth: number) {
    if (++count > profile.limits.nodes || depth > profile.limits.depth)
      fail(node, "Markdown exceeds structural limits.", CODES.tooLarge);
    if (node.type === "definition") definitions.set(node.identifier, node);
    if ("children" in node)
      for (const child of node.children) inspect(child, depth + 1);
  }
  inspect(tree, 0);
  const has = (name: string) => profile.nodeNames.has(name);
  const hasMark = (name: string) => profile.marks.includes(name as never);
  function need(node: Nodes, name: string, label: string) {
    if (!has(name)) fail(node, `${label} are not allowed here.`, CODES.blockNotAllowed);
  }
  function needMark(node: Nodes, name: string, label: string) {
    if (!hasMark(name))
      fail(node, `${label} is not allowed here.`, CODES.markNotAllowed);
  }
  function url(node: Nodes, value: string, image = false): string {
    if (image) {
      const spec = profile.blockSchemas.get("image")?.attrs.src;
      if (!spec)
        return fail(node, "Images are not allowed here.", CODES.blockNotAllowed);
      if (!/^[a-z]+:/i.test(value))
        fail(node, "Local image files must be uploaded first.", CODES.unmanagedBinary);
      const check = checkUrlAttr(profile, spec, value);
      if (check !== true) fail(node, "URL is unsafe or expiring.", CODES.unsafeUrl);
      return value;
    }
    if (
      checkUrlAttr(profile, { ...LINK_SPEC, validate: (v) => isSafeUrl(v) }, value) !==
      true
    )
      fail(node, "URL is unsafe or expiring.", CODES.unsafeUrl);
    return value;
  }
  function inline(items: PhrasingContent[], marks: Mark[] = []): JSONContent[] {
    return items.flatMap((node): JSONContent[] => {
      switch (node.type) {
        case "text": {
          const raw = body.slice(
            node.position?.start.offset ?? 0,
            node.position?.end.offset ?? 0,
          );
          if (
            /(?<!\\)<\/?[A-Za-z][^>]*>/.test(raw) ||
            /^(?:import|export)\s/m.test(raw)
          )
            fail(node, "MDX/JSX and module syntax are unsupported.");
          return node.value
            ? [{ type: "text", text: node.value, ...(marks.length ? { marks } : {}) }]
            : [];
        }
        case "strong":
          needMark(node, "bold", "Bold");
          return inline(node.children, [...marks, { type: "bold" }]);
        case "emphasis":
          needMark(node, "italic", "Italic");
          return inline(node.children, [...marks, { type: "italic" }]);
        case "delete":
          needMark(node, "strike", "Strikethrough");
          return inline(node.children, [...marks, { type: "strike" }]);
        case "inlineCode":
          needMark(node, "code", "Inline code");
          return [
            { type: "text", text: node.value, marks: [...marks, { type: "code" }] },
          ];
        case "break":
          need(node, "hardBreak", "Line breaks");
          if (marks.length) fail(node, "Marked line breaks are unsupported.");
          return [{ type: "hardBreak" }];
        case "link":
          needMark(node, "link", "A link");
          return inline(node.children, [
            ...marks,
            {
              type: "link",
              attrs: { href: url(node, node.url), title: node.title ?? null },
            },
          ]);
        case "linkReference": {
          needMark(node, "link", "A link");
          const def = definitions.get(node.identifier);
          if (!def) fail(node, "Missing link definition.", CODES.brokenLink);
          return inline(node.children, [
            ...marks,
            {
              type: "link",
              attrs: { href: url(node, def.url), title: def.title ?? null },
            },
          ]);
        }
        case "mdxJsxTextElement":
          return fail(
            node,
            `Inline <${node.name ?? ""}> is unsupported. Put the component on its own lines.`,
          );
        default:
          return fail(node, `Unsupported inline construct: ${node.type}.`);
      }
    });
  }
  function image(
    node: Extract<PhrasingContent, { type: "image" | "imageReference" }>,
  ): JSONContent {
    const def =
      node.type === "imageReference" ? definitions.get(node.identifier) : node;
    if (!def) fail(node, "Missing image definition.", CODES.brokenLink);
    return {
      type: "image",
      attrs: {
        src: url(node, def.url, true),
        alt: node.alt ?? "",
        title: def.title ?? null,
      },
    };
  }
  function props(
    element: MdxJsxFlowElement,
    allowed: string[],
  ): Record<string, unknown> {
    const name = element.name ?? "";
    const output: Record<string, unknown> = {};
    for (const attribute of element.attributes as (
      | MdxJsxAttribute
      | MdxJsxExpressionAttribute
    )[]) {
      if (attribute.type === "mdxJsxExpressionAttribute")
        fail(element, "Spread props are unsupported.", CODES.unsupportedAttribute);
      if (!allowed.includes(attribute.name))
        fail(
          element,
          `Unsupported <${name}> prop: ${attribute.name}.`,
          CODES.unsupportedAttribute,
        );
      const value = attribute.value;
      if (value === null || value === undefined) output[attribute.name] = true;
      else if (typeof value === "string") output[attribute.name] = value;
      else
        try {
          output[attribute.name] = evaluateLiteral(value.value);
        } catch {
          fail(
            element,
            `<${name}> prop ${attribute.name} must be a literal value.`,
            CODES.unsupportedAttribute,
          );
        }
    }
    return output;
  }
  function attrs(
    element: MdxJsxFlowElement,
    schema: BlockSchema,
  ): Record<string, unknown> {
    const name = element.name ?? "";
    const specs = Object.entries(schema.attrs).filter(
      ([, spec]) => spec.markdown !== false,
    );
    const byProp = new Map(specs.map(([key, spec]) => [spec.prop ?? key, key]));
    const given = props(element, [...byProp.keys()]);
    const output: Record<string, unknown> = {};
    for (const [key, spec] of Object.entries(schema.attrs)) {
      const prop = spec.prop ?? key;
      if (spec.markdown === false || !Object.hasOwn(given, prop)) {
        if (spec.required && spec.markdown !== false)
          fail(element, `<${name}> needs a ${prop} prop.`, CODES.invalidDocument);
        output[key] = spec.default;
        continue;
      }
      const value = given[prop];
      const check = spec.url
        ? checkUrlAttr(profile, spec, value)
        : spec.validate(value);
      if (check !== true)
        fail(
          element,
          typeof check === "string" ? check : `Invalid <${name}> prop: ${prop}.`,
          spec.url ? CODES.unsafeUrl : CODES.unsupportedAttribute,
        );
      output[key] = value;
    }
    return output;
  }
  function elements(element: MdxJsxFlowElement, tags: string[]): MdxJsxFlowElement[] {
    const name = element.name ?? "";
    const output = element.children
      .filter((child) => child.type !== "definition")
      .map((child) => {
        if (child.type !== "mdxJsxFlowElement" || !tags.includes(child.name ?? ""))
          fail(child, `<${name}> can only contain <${tags.join("> or <")}>.`);
        return child as MdxJsxFlowElement;
      });
    if (!output.length)
      fail(
        element,
        `<${name}> needs at least one <${tags[0]}>.`,
        CODES.invalidDocument,
      );
    return output;
  }
  const ctx: MarkdownReadContext = {
    attrs,
    props,
    blocks: (children) => children.flatMap(block),
    child: (element, parent) => component(element, parent),
    elements,
    fail,
  };
  function component(element: MdxJsxFlowElement, parent?: BlockSchema): JSONContent {
    const name = element.name ?? "";
    const entry = profile.tags.get(name);
    if (!entry)
      fail(
        element,
        `Unknown component <${name}>. Use a supported block or plain Markdown.`,
        CODES.blockNotAllowed,
      );
    if (entry.parent && parent !== entry.parent)
      fail(element, `<${name}> must be inside <${entry.parent.tag}>.`);
    const { schema } = entry;
    if (schema.fromMarkdown) return schema.fromMarkdown(element, ctx);
    const values = attrs(element, schema);
    const children = element.children.filter((child) => child.type !== "definition");
    const output: JSONContent = { type: schema.name };
    if (Object.keys(values).length) output.attrs = values;
    if (schema.content === undefined) {
      if (children.length) fail(element, `<${name}> cannot have children.`);
      return output;
    }
    const content = schema.children?.length
      ? elements(
          element,
          schema.children.flatMap((child) => (child.tag ? [child.tag] : [])),
        ).map((child) => component(child, schema))
      : (element.children as RootContent[]).flatMap(block);
    // An empty block is an empty paragraph, as the editor inserts it.
    if (!content.length && /\+\s*$/.test(schema.content))
      content.push({ type: "paragraph" });
    if (content.length) output.content = content;
    return output;
  }
  function block(node: RootContent): JSONContent[] {
    switch (node.type) {
      case "definition":
        return [];
      case "paragraph": {
        const only = node.children.length === 1 ? node.children[0] : undefined;
        if (only?.type === "mdxJsxTextElement")
          return [
            component({
              ...only,
              type: "mdxJsxFlowElement",
              children: only.children.length
                ? [{ type: "paragraph", children: only.children }]
                : [],
            } as MdxJsxFlowElement),
          ];
        if (only && (only.type === "image" || only.type === "imageReference")) {
          need(node, "image", "Images");
          return [image(only)];
        }
        return [{ type: "paragraph", content: inline(node.children) }];
      }
      case "heading":
        need(node, "heading", "Headings");
        if (!profile.headingLevels.includes(node.depth as never))
          fail(
            node,
            `Heading level ${node.depth} is not allowed here.`,
            CODES.blockNotAllowed,
          );
        return [
          {
            type: "heading",
            attrs: { level: node.depth },
            content: inline(node.children),
          },
        ];
      case "blockquote":
        need(node, "blockquote", "Quotes");
        return [{ type: "blockquote", content: node.children.flatMap(block) }];
      case "thematicBreak":
        need(node, "horizontalRule", "Dividers");
        return [{ type: "horizontalRule" }];
      case "code": {
        need(node, "codeBlock", "Code blocks");
        // Without a language, remark reads `title="…"` itself as the language.
        const untitled = node.lang?.startsWith("title=");
        const meta = untitled
          ? [node.lang, node.meta].filter(Boolean).join(" ")
          : node.meta;
        const lang = untitled ? null : node.lang;
        const title = meta ? CODE_TITLE.exec(meta.trim()) : null;
        if (meta && !title)
          fail(
            node,
            'Code fence metadata other than title="…" is unsupported.',
            CODES.unsupportedAttribute,
          );
        return [
          {
            type: "codeBlock",
            attrs: {
              language: lang ?? null,
              ...(title ? { title: title[1] ?? title[2] } : {}),
            },
            content: node.value ? [{ type: "text", text: node.value }] : [],
          },
        ];
      }
      case "mdxJsxFlowElement":
        return [component(node)];
      case "html": {
        const tag = /^<([A-Z][\w.]*)/.exec(node.value);
        return tag
          ? fail(
              node,
              `Unknown component <${tag[1]}>. Use a supported block or plain Markdown.`,
              CODES.blockNotAllowed,
            )
          : fail(node, "Raw HTML is unsupported.");
      }
      case "list":
        need(
          node,
          node.ordered ? "orderedList" : "bulletList",
          node.ordered ? "Numbered lists" : "Bullet lists",
        );
        return [
          {
            type: node.ordered ? "orderedList" : "bulletList",
            ...(node.ordered ? { attrs: { start: node.start ?? 1 } } : {}),
            content: node.children.map((item) => {
              if (item.checked !== null && item.checked !== undefined)
                fail(item, "Task lists are unsupported.");
              const content = item.children.flatMap(block);
              return {
                type: "listItem",
                content: content.length ? content : [{ type: "paragraph" }],
              };
            }),
          },
        ];
      case "table":
        need(node, "table", "Tables");
        if (node.align?.some((alignment) => alignment !== null))
          fail(node, "Table alignment is unsupported.", CODES.unsupportedAttribute);
        return [
          {
            type: "table",
            content: node.children.map((row, i) => ({
              type: "tableRow",
              content: row.children.map((cell) => ({
                type: i === 0 ? "tableHeader" : "tableCell",
                content: [{ type: "paragraph", content: inline(cell.children) }],
              })),
            })),
          },
        ];
      default:
        return fail(node, `Unsupported block construct: ${node.type}.`);
    }
  }
  // A top-level block yields zero or more nodes; remember where each node came
  // from so schema failures found after conversion still point at a line.
  const converted: JSONContent[] = [];
  const origins: Nodes[] = [];
  for (const child of tree.children)
    for (const node of block(child)) {
      converted.push(node);
      origins.push(child);
    }
  try {
    return requireContent(profile, { type: "doc", content: converted });
  } catch (cause) {
    if (!(cause instanceof ContentError)) throw cause;
    throw new ContentError(
      cause.diagnostics.map((item) => {
        const index = /^content\.content\[(\d+)\]/.exec(item.fieldPath ?? "");
        const start = index ? origins[Number(index[1])]?.position?.start : undefined;
        return {
          ...item,
          file: options.file,
          ...(start ? { line: start.line + offset, column: start.column } : {}),
        };
      }),
    );
  }
}

/** Build mark runs rather than wrapping each text separately (adjacent delimiters are ambiguous). */
function toInline(children: JSONContent[]): PhrasingContent[] {
  const rank = ["link", "bold", "italic", "strike", "code"];
  for (const node of children)
    for (const mark of node.marks ?? [])
      if (!rank.includes(mark.type))
        throw new ContentError([
          diagnostic(
            CODES.unsupportedSyntax,
            `Markdown has no form for the ${mark.type} mark.`,
          ),
        ]);
  const nodes = children.map((node) => ({
    ...node,
    marks: [...(node.marks ?? [])].sort(
      (a, b) => rank.indexOf(a.type) - rank.indexOf(b.type),
    ),
  }));
  function group(items: JSONContent[], depth: number): PhrasingContent[] {
    const output: PhrasingContent[] = [];
    for (let i = 0; i < items.length; ) {
      const node = items[i];
      const mark = node.marks?.[depth];
      if (!mark) {
        if (node.type === "hardBreak") output.push({ type: "break" });
        else output.push({ type: "text", value: node.text! });
        i++;
        continue;
      }
      let end = i + 1;
      while (
        end < items.length &&
        JSON.stringify(items[end].marks?.[depth]) === JSON.stringify(mark)
      )
        end++;
      const children = group(items.slice(i, end), depth + 1);
      switch (mark.type) {
        case "link":
          output.push({
            type: "link",
            url: mark.attrs!.href,
            title: mark.attrs?.title ?? null,
            children,
          });
          break;
        case "bold":
          output.push({ type: "strong", children });
          break;
        case "italic":
          output.push({ type: "emphasis", children });
          break;
        case "strike":
          output.push({ type: "delete", children });
          break;
        case "code":
          output.push({
            type: "inlineCode",
            value: items
              .slice(i, end)
              .map((item) => item.text)
              .join(""),
          });
          break;
      }
      i = end;
    }
    return output;
  }
  return group(nodes, 0);
}

/** Tiptap JSON to Markdown. Refuses content without a lossless Markdown form. */
export function serializeMarkdown(profile: Profile, input: unknown): string {
  const content = requireContent(profile, input);
  const unsupported = (message: string): never => {
    throw new ContentError([
      diagnostic(codeFor(profile, CODES.unsupportedSyntax), message),
    ]);
  };
  const prop = (
    name: string,
    value: unknown,
    expression = false,
  ): MdxJsxAttribute | undefined =>
    value === null || value === undefined
      ? undefined
      : {
          type: "mdxJsxAttribute",
          name,
          value: expression
            ? { type: "mdxJsxAttributeValueExpression", value: String(value) }
            : String(value),
        };
  const ctx: MarkdownWriteContext = {
    blocks: (nodes) => nodes.map(block),
    prop,
    literal: writeLiteral,
    props: (schema, attrs) =>
      Object.entries(schema.attrs).flatMap(([key, spec]) => {
        const value = attrs[key];
        if (spec.markdown === false || value === null || value === undefined) return [];
        const name = spec.prop ?? key;
        return [
          typeof value === "string"
            ? prop(name, value)!
            : prop(name, writeLiteral(value), true)!,
        ];
      }),
    element: (name, attributes, children = []) => ({
      type: "mdxJsxFlowElement",
      name,
      attributes: attributes.filter((item) => item !== undefined),
      children: children as MdxJsxFlowElement["children"],
    }),
  };
  function generic(node: JSONContent, schema: BlockSchema): RootContent {
    if (!schema.tag) return unsupported(`Cannot serialize ${node.type}.`);
    const children = node.content ?? [];
    return ctx.element(
      schema.tag,
      ctx.props(schema, node.attrs ?? {}),
      schema.content === undefined
        ? []
        : schema.children?.length
          ? children.map((child) => {
              const childSchema = schema.children!.find(
                (item) => item.name === child.type,
              );
              return childSchema
                ? (childSchema.toMarkdown?.(child, ctx) ?? generic(child, childSchema))
                : unsupported(`Cannot serialize ${child.type}.`);
            })
          : children.map(block),
    );
  }
  function block(node: JSONContent): RootContent {
    const children = node.content ?? [];
    switch (node.type) {
      case "paragraph":
        return { type: "paragraph", children: toInline(children) };
      case "heading":
        return {
          type: "heading",
          depth: node.attrs!.level,
          children: toInline(children),
        };
      case "horizontalRule":
        return { type: "thematicBreak" };
      case "image":
        if (node.attrs?.media) break;
        return {
          type: "paragraph",
          children: [
            {
              type: "image",
              url: node.attrs!.src,
              alt: node.attrs?.alt ?? "",
              title: node.attrs?.title ?? null,
            },
          ],
        };
      case "codeBlock": {
        const title: string | null = node.attrs?.title ?? null;
        const language: string | null = node.attrs?.language ?? null;
        const meta = title
          ? title.includes('"')
            ? `title='${title}'`
            : `title="${title}"`
          : null;
        // remark drops meta when there is no language; write it as the info string.
        return {
          type: "code",
          lang: language ?? meta,
          meta: language ? meta : null,
          value: children.map((child) => child.text ?? "").join(""),
        };
      }
      case "blockquote":
        return {
          type: "blockquote",
          children: children.map(block) as Extract<
            RootContent,
            { type: "blockquote" }
          >["children"],
        };
      case "bulletList":
      case "orderedList":
        return {
          type: "list",
          ordered: node.type === "orderedList",
          start: node.type === "orderedList" ? (node.attrs?.start ?? 1) : null,
          spread: true,
          children: children.map((item) => ({
            type: "listItem",
            spread: true,
            children: (item.content ?? []).map(block) as Extract<
              RootContent,
              { type: "listItem" }
            >["children"],
          })),
        };
      case "table":
        return {
          type: "table",
          children: children.map((row) => ({
            type: "tableRow",
            children: (row.content ?? []).map((cell) => {
              if (cell.content?.length !== 1 || cell.content[0].type !== "paragraph")
                unsupported("Markdown tables hold one paragraph per cell.");
              return {
                type: "tableCell",
                children: toInline(cell.content![0].content ?? []),
              };
            }),
          })),
        };
    }
    const schema = profile.blockSchemas.get(node.type ?? "");
    if (!schema || !schema.group) return unsupported(`Cannot serialize ${node.type}.`);
    return schema.toMarkdown?.(node, ctx) ?? generic(node, schema);
  }
  const tree: Root = { type: "root", children: (content.content ?? []).map(block) };
  const markdown = writer.stringify(tree);
  // A serializer must never silently change semantic structure (e.g. empty blocks).
  const roundtrip = parseMarkdown(profile, markdown);
  // Markdown does not encode blank paragraph spacing. Ignore empty paragraphs
  // in semantic comparisons, keeping one where the node needs content (a new
  // callout or table cell); retain them all in canonical editor JSON.
  const schema = getProfileSchema(profile);
  const semantic = (node: JSONContent): JSONContent => {
    if (!node.content) return node;
    const children = node.content
      .filter((child) => child.type !== "paragraph" || child.content?.length)
      .map(semantic);
    const required =
      node.type !== "doc" && !schema.nodes[node.type!].contentMatch.validEnd;
    if (children.length) return { ...node, content: children };
    if (required) return { ...node, content: [{ type: "paragraph" }] };
    const { content: _empty, ...rest } = node;
    return node.type === "doc" ? { ...rest, content: [] } : rest;
  };
  if (JSON.stringify(semantic(roundtrip)) !== JSON.stringify(semantic(content)))
    throw new ContentError([
      diagnostic(
        codeFor(profile, CODES.invalidDocument),
        "Content has no lossless Markdown representation.",
      ),
    ]);
  return markdown;
}
