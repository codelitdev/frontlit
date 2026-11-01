import type { JSONContent } from "@tiptap/core";
import type { Root, RootContent, PhrasingContent, Definition, Nodes } from "mdast";
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
  type MdxJsxTextElement,
} from "mdast-util-mdx-jsx";
import { parseExpressionAt, type Expression } from "acorn";
import { DocsContentError, diagnostic } from "./diagnostics";
import { requireDocsContent, DOCS_LIMITS } from "./validate";
import { docsSchema } from "./extensions";
import {
  splitDocsFrontmatter,
  serializeDocsFrontmatter,
  type DocsFrontmatter,
} from "./frontmatter";
import { isSafeDocsUrl } from "./urls";
import { CALLOUT_TYPES, DOCS_BLOCK_COMPONENTS, type TypeTableRow } from "./blocks";

export const DOCS_PARSER_VERSION = 2;

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
    {
      // The stock handler indents children, which turns nested fences into indented code.
      handlers: { mdxJsxFlowElement: writeComponent as never },
    },
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
const COMPONENT_TAG = new RegExp(
  `<\\/?(?:${Object.keys(DOCS_BLOCK_COMPONENTS).join("|")})\\b`,
);

const CODE_TITLE = /^title=(?:"([^"\n]+)"|'([^'\n]+)')$/;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const ICON = /^[A-Za-z][\w-]*$/;
/** Props each component accepts, and the only child a container may hold. */
const PROPS: Record<string, string[]> = {
  Callout: ["type", "title"],
  Tabs: ["items"],
  Tab: ["value"],
  Steps: [],
  Step: [],
  Cards: [],
  Card: ["title", "href", "icon"],
  Accordions: ["type"],
  Accordion: ["title"],
  CodeGroup: [],
  TypeTable: ["type"],
};
const CHILD: Record<string, string> = {
  Tabs: "Tab",
  Steps: "Step",
  Cards: "Card",
  Accordions: "Accordion",
};
const TYPE_TABLE_FIELDS = ["type", "default", "description", "required"];

/** Files that use a rich-block tag follow MDX rules; all others stay plain CommonMark. */
function parseTree(
  body: string,
  fail: (place: { line: number; column: number } | undefined, message: string) => never,
): Root {
  if (!COMPONENT_TAG.test(body)) return parser.parse(body);
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

/** Evaluates a prop expression made only of literals: strings, numbers, booleans, null, arrays, objects. */
function literal(source: string): unknown {
  const expression = parseExpressionAt(source, 0, { ecmaVersion: "latest" });
  if (source.slice(expression.end).trim()) throw new Error("Unexpected input.");
  return evaluate(expression);
}
function evaluate(node: Expression): unknown {
  switch (node.type) {
    case "Literal":
      if (
        node.value === null ||
        ["string", "number", "boolean"].includes(typeof node.value)
      )
        return node.value;
      break;
    case "TemplateLiteral":
      if (!node.expressions.length) return node.quasis[0].value.cooked;
      break;
    case "UnaryExpression":
      if (
        node.operator === "-" &&
        node.argument.type === "Literal" &&
        typeof node.argument.value === "number"
      )
        return -node.argument.value;
      break;
    case "ArrayExpression":
      return node.elements.map((element) => {
        if (!element || element.type === "SpreadElement")
          throw new Error("Not literal.");
        return evaluate(element);
      });
    case "ObjectExpression": {
      const output: Record<string, unknown> = {};
      for (const property of node.properties) {
        if (
          property.type !== "Property" ||
          property.kind !== "init" ||
          property.computed ||
          property.method ||
          property.shorthand
        )
          throw new Error("Not literal.");
        const key =
          property.key.type === "Identifier"
            ? property.key.name
            : property.key.type === "Literal" && typeof property.key.value === "string"
              ? property.key.value
              : undefined;
        if (key === undefined || key === "__proto__" || Object.hasOwn(output, key))
          throw new Error("Not literal.");
        output[key] = evaluate(property.value as Expression);
      }
      return output;
    }
  }
  throw new Error("Not literal.");
}

/** A JS string literal, single-quoted when that avoids escaping double quotes. */
function quote(value: string): string {
  return value.includes('"') && !/['\\\n]/.test(value)
    ? `'${value}'`
    : JSON.stringify(value);
}

function formatRows(rows: TypeTableRow[]): string {
  const lines = rows.map((row) => {
    const fields = [
      `type: ${quote(row.type)}`,
      ...(row.default === null ? [] : [`default: ${quote(row.default)}`]),
      ...(row.description === null ? [] : [`description: ${quote(row.description)}`]),
      ...(row.required ? ["required: true"] : []),
    ];
    const key = IDENTIFIER.test(row.name) ? row.name : JSON.stringify(row.name);
    return `    ${key}: { ${fields.join(", ")} },`;
  });
  return `{\n${lines.join("\n")}\n  }`;
}
type Mark = NonNullable<JSONContent["marks"]>[number];

/** DM-CONVERT: CommonMark/GFM is parsed as data. Unsupported constructs fail closed. */
export function parseDocsMarkdown(
  markdown: string,
  options: { file?: string; frontmatter?: boolean } = {},
) {
  if (
    typeof markdown !== "string" ||
    new TextEncoder().encode(markdown).length > DOCS_LIMITS.bytes
  )
    throw new DocsContentError([
      diagnostic("INVALID_DOCUMENT", "Markdown exceeds size limit.", {
        file: options.file,
      }),
    ]);
  const source =
    options.frontmatter === false
      ? {
          body: markdown.replace(/\r\n?/g, "\n"),
          lineOffset: 0,
          frontmatter: undefined,
        }
      : splitDocsFrontmatter(markdown, options.file);
  const tree = parseTree(source.body, (place, message) => {
    throw new DocsContentError([
      diagnostic("UNSUPPORTED_NODE", message, {
        file: options.file,
        line: place ? place.line + source.lineOffset : undefined,
        column: place?.column,
      }),
    ]);
  });
  const definitions = new Map<string, Definition>();
  function error(node: Nodes, message: string, code = "UNSUPPORTED_NODE"): never {
    throw new DocsContentError([
      diagnostic(code, message, {
        file: options.file,
        line: node.position ? node.position.start.line + source.lineOffset : undefined,
        column: node.position?.start.column,
      }),
    ]);
  }
  let nodes = 0;
  function inspect(node: Nodes, depth: number) {
    if (++nodes > DOCS_LIMITS.nodes || depth > DOCS_LIMITS.depth)
      error(node, "Markdown exceeds structural limits.", "INVALID_DOCUMENT");
    if (node.type === "definition") definitions.set(node.identifier, node);
    if ("children" in node)
      for (const child of node.children) inspect(child, depth + 1);
  }
  inspect(tree, 0);
  function url(node: Nodes, value: string, image = false) {
    if (image && !/^[a-z]+:/i.test(value))
      error(
        node,
        "Local image binaries must be uploaded to MediaLit.",
        "UNMANAGED_BINARY",
      );
    if (!isSafeDocsUrl(value, image))
      error(node, "URL is unsafe or expiring.", "UNSAFE_URL");
    return value;
  }
  function inline(items: PhrasingContent[], marks: Mark[] = []): JSONContent[] {
    return items.flatMap((node): JSONContent[] => {
      switch (node.type) {
        case "text": {
          const raw = source.body.slice(
            node.position?.start.offset ?? 0,
            node.position?.end.offset ?? 0,
          );
          if (
            /(?<!\\)<\/?[A-Za-z][^>]*>/.test(raw) ||
            /^(?:import|export)\s/m.test(raw)
          )
            error(node, "MDX/JSX and module syntax are unsupported.");
          return node.value
            ? [{ type: "text", text: node.value, ...(marks.length ? { marks } : {}) }]
            : [];
        }
        case "strong":
          return inline(node.children, [...marks, { type: "bold" }]);
        case "emphasis":
          return inline(node.children, [...marks, { type: "italic" }]);
        case "delete":
          return inline(node.children, [...marks, { type: "strike" }]);
        case "inlineCode":
          return [
            { type: "text", text: node.value, marks: [...marks, { type: "code" }] },
          ];
        case "break":
          if (marks.length) error(node, "Marked line breaks are unsupported.");
          return [{ type: "hardBreak" }];
        case "link":
          return inline(node.children, [
            ...marks,
            {
              type: "link",
              attrs: { href: url(node, node.url), title: node.title ?? null },
            },
          ]);
        case "linkReference": {
          const def = definitions.get(node.identifier);
          if (!def) error(node, "Missing link definition.", "BROKEN_LINK");
          return inline(node.children, [
            ...marks,
            {
              type: "link",
              attrs: { href: url(node, def.url), title: def.title ?? null },
            },
          ]);
        }
        case "mdxJsxTextElement":
          return error(
            node,
            `Inline <${node.name ?? ""}> is unsupported. Put the component on its own lines.`,
          );
        default:
          return error(node, `Unsupported inline construct: ${node.type}.`);
      }
    });
  }
  function image(
    node: Extract<PhrasingContent, { type: "image" | "imageReference" }>,
  ): JSONContent {
    const def =
      node.type === "imageReference" ? definitions.get(node.identifier) : node;
    if (!def) error(node, "Missing image definition.", "BROKEN_LINK");
    return {
      type: "image",
      attrs: {
        src: url(node, def.url, true),
        alt: node.alt ?? "",
        title: def.title ?? null,
      },
    };
  }
  function props(node: MdxJsxFlowElement | MdxJsxTextElement) {
    const name = node.name ?? "";
    const output: Record<string, unknown> = {};
    for (const attribute of node.attributes as (
      | MdxJsxAttribute
      | MdxJsxExpressionAttribute
    )[]) {
      if (attribute.type === "mdxJsxExpressionAttribute")
        error(node, "Spread props are unsupported.", "UNSUPPORTED_ATTRIBUTE");
      if (!PROPS[name].includes(attribute.name))
        error(
          node,
          `Unsupported <${name}> prop: ${attribute.name}.`,
          "UNSUPPORTED_ATTRIBUTE",
        );
      const value = attribute.value;
      const icon =
        name === "Card" &&
        attribute.name === "icon" &&
        typeof value === "object" &&
        value
          ? /^\s*<([A-Za-z][\w-]*)\s*\/>\s*$/.exec(value.value)
          : null;
      if (value === null || value === undefined) output[attribute.name] = true;
      else if (typeof value === "string") output[attribute.name] = value;
      else if (icon) output.icon = icon[1];
      else
        try {
          output[attribute.name] = literal(value.value);
        } catch {
          error(
            node,
            `<${name}> prop ${attribute.name} must be a literal value.`,
            "UNSUPPORTED_ATTRIBUTE",
          );
        }
    }
    return output;
  }
  function component(
    node: MdxJsxFlowElement | MdxJsxTextElement,
    children: RootContent[],
    parent?: string,
  ): JSONContent {
    const name = node.name ?? "";
    if (!Object.hasOwn(PROPS, name))
      error(
        node,
        `Unknown component <${name}>. Use a supported block or plain Markdown.`,
      );
    const container = Object.keys(CHILD).find((key) => CHILD[key] === name);
    if (container && parent !== container)
      error(node, `<${name}> must be inside <${container}>.`);
    const p = props(node);
    const label = (prop: string, required: boolean): string | null => {
      const value = p[prop];
      if (value === undefined && !required) return null;
      if (typeof value !== "string")
        error(node, `<${name}> needs a text ${prop} prop.`, "INVALID_DOCUMENT");
      return value;
    };
    // An empty block is an empty paragraph, as the editor inserts it.
    const content = (optional = false) => {
      const output = children.flatMap(block);
      return output.length || optional ? output : [{ type: "paragraph" }];
    };
    const items = () => {
      const output = children
        .filter((child) => child.type !== "definition")
        .map((child) => {
          if (child.type !== "mdxJsxFlowElement" || child.name !== CHILD[name])
            error(child, `<${name}> can only contain <${CHILD[name]}>.`);
          return child;
        });
      if (!output.length)
        error(
          node,
          `<${name}> needs at least one <${CHILD[name]}>.`,
          "INVALID_DOCUMENT",
        );
      return output;
    };
    const nested = () =>
      items().map((child) => component(child, child.children as RootContent[], name));
    switch (name) {
      case "Callout": {
        const type = p.type ?? null;
        if (type !== null && !CALLOUT_TYPES.includes(type as never))
          error(
            node,
            `Callout type must be one of: ${CALLOUT_TYPES.join(", ")}.`,
            "UNSUPPORTED_ATTRIBUTE",
          );
        return {
          type: "callout",
          attrs: { type, title: label("title", false) },
          content: content(),
        };
      }
      case "Tabs": {
        const listed = p.items;
        if (
          listed !== undefined &&
          !(Array.isArray(listed) && listed.every((item) => typeof item === "string"))
        )
          error(
            node,
            "<Tabs> items must be a list of strings.",
            "UNSUPPORTED_ATTRIBUTE",
          );
        const tabs = nested().map((tab, i) => {
          const value: string =
            tab.attrs!.label ?? (listed as string[] | undefined)?.[i] ?? "";
          if (listed && !(listed as string[]).includes(value))
            error(
              node,
              `Tab value "${value}" is not listed in items.`,
              "INVALID_DOCUMENT",
            );
          return { ...tab, attrs: { label: value } };
        });
        return { type: "tabs", content: tabs };
      }
      case "Tab":
        return {
          type: "tab",
          attrs: { label: label("value", false) },
          content: content(),
        };
      case "Steps":
        return { type: "steps", content: nested() };
      case "Step":
        return { type: "step", content: content() };
      case "Cards":
        return { type: "cards", content: nested() };
      case "Card": {
        const href = label("href", false);
        if (href !== null && !isSafeDocsUrl(href))
          error(node, "Card link URL is unsafe.", "UNSAFE_URL");
        const icon = label("icon", false);
        if (icon !== null && !ICON.test(icon))
          error(node, "Card icon must be an icon name.", "UNSUPPORTED_ATTRIBUTE");
        const body = content(true);
        return {
          type: "card",
          attrs: { title: label("title", true), href, icon },
          ...(body.length ? { content: body } : {}),
        };
      }
      case "Accordions": {
        const type = p.type ?? null;
        if (type !== null && type !== "single" && type !== "multiple")
          error(
            node,
            'Accordions type must be "single" or "multiple".',
            "UNSUPPORTED_ATTRIBUTE",
          );
        return { type: "accordions", attrs: { type }, content: nested() };
      }
      case "Accordion":
        return {
          type: "accordion",
          attrs: { title: label("title", true) },
          content: content(),
        };
      case "CodeGroup": {
        for (const child of children)
          if (child.type !== "code")
            error(child, "<CodeGroup> can only contain code blocks.");
        return { type: "codeGroup", content: content() };
      }
      default: {
        if (children.length) error(node, "<TypeTable> cannot have children.");
        const type = p.type;
        if (!type || typeof type !== "object" || Array.isArray(type))
          error(node, "<TypeTable> needs a type={{ … }} prop.", "INVALID_DOCUMENT");
        const rows = Object.entries(type as Record<string, unknown>).map(
          ([field, entry]) => {
            const value = entry as Record<string, unknown>;
            if (
              !value ||
              typeof value !== "object" ||
              Array.isArray(value) ||
              typeof value.type !== "string" ||
              Object.keys(value).some((key) => !TYPE_TABLE_FIELDS.includes(key)) ||
              !["string", "undefined"].includes(typeof value.default) ||
              !["string", "undefined"].includes(typeof value.description) ||
              !["boolean", "undefined"].includes(typeof value.required)
            )
              error(
                node,
                `<TypeTable> field ${field} needs a string type and only string default/description and boolean required.`,
                "UNSUPPORTED_ATTRIBUTE",
              );
            return {
              name: field,
              type: value.type as string,
              default: (value.default as string | undefined) ?? null,
              description: (value.description as string | undefined) ?? null,
              required: (value.required as boolean | undefined) ?? false,
            };
          },
        );
        return { type: "typeTable", attrs: { rows } };
      }
    }
  }
  function block(node: RootContent): JSONContent[] {
    switch (node.type) {
      case "definition":
        return [];
      case "paragraph": {
        const only = node.children.length === 1 ? node.children[0] : undefined;
        if (only?.type === "mdxJsxTextElement")
          return [
            component(
              only,
              only.children.length
                ? [{ type: "paragraph", children: only.children }]
                : [],
            ),
          ];
        if (
          node.children.length === 1 &&
          ["image", "imageReference"].includes(node.children[0].type)
        )
          return [
            image(
              node.children[0] as Extract<
                PhrasingContent,
                { type: "image" | "imageReference" }
              >,
            ),
          ];
        return [{ type: "paragraph", content: inline(node.children) }];
      }
      case "heading":
        return [
          {
            type: "heading",
            attrs: { level: node.depth },
            content: inline(node.children),
          },
        ];
      case "blockquote":
        return [{ type: "blockquote", content: node.children.flatMap(block) }];
      case "thematicBreak":
        return [{ type: "horizontalRule" }];
      case "code": {
        // Without a language, remark reads `title="…"` itself as the language.
        const untitled = node.lang?.startsWith("title=");
        const meta = untitled
          ? [node.lang, node.meta].filter(Boolean).join(" ")
          : node.meta;
        const lang = untitled ? null : node.lang;
        const title = meta ? CODE_TITLE.exec(meta.trim()) : null;
        if (meta && !title)
          error(
            node,
            'Code fence metadata other than title="…" is unsupported.',
            "UNSUPPORTED_ATTRIBUTE",
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
        return [component(node, node.children as RootContent[])];
      case "html": {
        const tag = /^<([A-Z][\w.]*)/.exec(node.value);
        return error(
          node,
          tag
            ? `Unknown component <${tag[1]}>. Use a supported block or plain Markdown.`
            : "Raw HTML is unsupported.",
        );
      }
      case "list":
        return [
          {
            type: node.ordered ? "orderedList" : "bulletList",
            ...(node.ordered ? { attrs: { start: node.start ?? 1 } } : {}),
            content: node.children.map((item) => {
              if (item.checked !== null && item.checked !== undefined)
                error(item, "Task lists are unsupported.");
              const content = item.children.flatMap(block);
              return {
                type: "listItem",
                content: content.length ? content : [{ type: "paragraph" }],
              };
            }),
          },
        ];
      case "table":
        if (node.align?.some((alignment) => alignment !== null))
          error(node, "Table alignment is unsupported.", "UNSUPPORTED_ATTRIBUTE");
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
        return error(node, `Unsupported block construct: ${node.type}.`);
    }
  }
  const content = requireDocsContent({
    type: "doc",
    content: tree.children.flatMap(block),
  });
  return { content, frontmatter: source.frontmatter };
}

/** Build mark runs rather than wrapping each text separately (adjacent delimiters are ambiguous). */
function toInline(children: JSONContent[]): PhrasingContent[] {
  const rank = ["link", "bold", "italic", "strike", "code"];
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

export function serializeDocsMarkdown(
  input: unknown,
  frontmatter?: DocsFrontmatter,
): string {
  const content = requireDocsContent(input);
  const prop = (
    name: string,
    value: string | null | undefined,
    expression = false,
  ): MdxJsxAttribute | undefined =>
    value === null || value === undefined
      ? undefined
      : {
          type: "mdxJsxAttribute",
          name,
          value: expression ? { type: "mdxJsxAttributeValueExpression", value } : value,
        };
  function element(
    name: string,
    attributes: (MdxJsxAttribute | undefined)[],
    content: JSONContent[],
    nested?: () => MdxJsxFlowElement[],
  ): MdxJsxFlowElement {
    return {
      type: "mdxJsxFlowElement",
      name,
      attributes: attributes.filter((item) => item !== undefined),
      children: (nested
        ? nested()
        : content.map(block)) as MdxJsxFlowElement["children"],
    };
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
      case "callout":
        return element(
          "Callout",
          [prop("type", node.attrs?.type), prop("title", node.attrs?.title)],
          children,
        );
      case "tabs": {
        const labels = children.map((tab) => quote(tab.attrs!.label));
        return element(
          "Tabs",
          [prop("items", `[${labels.join(", ")}]`, true)],
          [],
          () =>
            children.map((tab) =>
              element("Tab", [prop("value", tab.attrs!.label)], tab.content ?? []),
            ),
        );
      }
      case "steps":
        return element("Steps", [], [], () =>
          children.map((step) => element("Step", [], step.content ?? [])),
        );
      case "cards":
        return element("Cards", [], [], () =>
          children.map((card) =>
            element(
              "Card",
              [
                prop("title", card.attrs!.title),
                prop("href", card.attrs?.href),
                prop("icon", card.attrs?.icon ? `<${card.attrs.icon} />` : null, true),
              ],
              card.content ?? [],
            ),
          ),
        );
      case "accordions":
        return element("Accordions", [prop("type", node.attrs?.type)], [], () =>
          children.map((item) =>
            element(
              "Accordion",
              [prop("title", item.attrs!.title)],
              item.content ?? [],
            ),
          ),
        );
      case "codeGroup":
        return element("CodeGroup", [], children);
      case "typeTable":
        return element(
          "TypeTable",
          [prop("type", formatRows(node.attrs?.rows ?? []), true)],
          [],
        );
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
            children: (row.content ?? []).map((cell) => ({
              type: "tableCell",
              children: toInline(cell.content![0].content ?? []),
            })),
          })),
        };
      default:
        throw new DocsContentError([
          diagnostic("UNSUPPORTED_NODE", `Cannot serialize ${node.type}.`),
        ]);
    }
  }
  const tree: Root = { type: "root", children: (content.content ?? []).map(block) };
  const markdown = writer.stringify(tree);
  // A serializer must never silently change semantic structure (e.g. empty blocks).
  const roundtrip = parseDocsMarkdown(markdown, { frontmatter: false }).content;
  // Markdown does not encode blank paragraph spacing. Ignore empty paragraphs
  // in semantic comparisons, keeping one where the node needs content (a new
  // callout or table cell); retain them all in canonical editor JSON.
  const semantic = (node: JSONContent): JSONContent => {
    if (!node.content) return node;
    const children = node.content
      .filter((child) => child.type !== "paragraph" || child.content?.length)
      .map(semantic);
    const required =
      node.type !== "doc" && !docsSchema.nodes[node.type!].contentMatch.validEnd;
    if (children.length) return { ...node, content: children };
    if (required) return { ...node, content: [{ type: "paragraph" }] };
    const { content: _empty, ...rest } = node;
    return node.type === "doc" ? { ...rest, content: [] } : rest;
  };
  if (JSON.stringify(semantic(roundtrip)) !== JSON.stringify(semantic(content)))
    throw new DocsContentError([
      diagnostic(
        "INVALID_DOCUMENT",
        "Content has no lossless Markdown representation.",
      ),
    ]);
  return (frontmatter ? serializeDocsFrontmatter(frontmatter) : "") + markdown;
}
