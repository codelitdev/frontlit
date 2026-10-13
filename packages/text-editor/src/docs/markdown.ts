import type { JSONContent } from "@tiptap/core";
import type { Root, RootContent, PhrasingContent, Definition, Nodes } from "mdast";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkStringify from "remark-stringify";
import { DocsContentError, diagnostic } from "./diagnostics";
import { requireDocsContent, DOCS_LIMITS } from "./validate";
import {
  splitDocsFrontmatter,
  serializeDocsFrontmatter,
  type DocsFrontmatter,
} from "./frontmatter";
import { isSafeDocsUrl } from "./urls";

export const DOCS_PARSER_VERSION = 1;
const parser = unified().use(remarkParse).use(remarkGfm);
const writer = unified().use(remarkGfm).use(remarkStringify, {
  bullet: "-",
  emphasis: "*",
  strong: "*",
  fences: true,
  incrementListMarker: true,
});
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
  const tree = parser.parse(source.body);
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
          if (marks.length) error(node, "Inline code cannot carry other marks.");
          return [{ type: "text", text: node.value, marks: [{ type: "code" }] }];
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
  function block(node: RootContent): JSONContent[] {
    switch (node.type) {
      case "definition":
        return [];
      case "paragraph": {
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
      case "code":
        if (node.meta)
          error(node, "Code fence metadata is unsupported.", "UNSUPPORTED_ATTRIBUTE");
        return [
          {
            type: "codeBlock",
            attrs: { language: node.lang ?? null },
            content: node.value ? [{ type: "text", text: node.value }] : [],
          },
        ];
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
      case "codeBlock":
        return {
          type: "code",
          lang: node.attrs?.language ?? null,
          value: children.map((child) => child.text ?? "").join(""),
        };
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
  // Markdown does not encode blank paragraph spacing. Ignore empty top-level
  // paragraphs in semantic comparisons; retain them in canonical editor JSON.
  const semantic = (doc: JSONContent) => ({
    ...doc,
    content:
      doc.content?.filter(
        (node) => node.type !== "paragraph" || node.content?.length,
      ) ?? [],
  });
  if (JSON.stringify(semantic(roundtrip)) !== JSON.stringify(semantic(content)))
    throw new DocsContentError([
      diagnostic(
        "INVALID_DOCUMENT",
        "Content has no lossless Markdown representation.",
      ),
    ]);
  return (frontmatter ? serializeDocsFrontmatter(frontmatter) : "") + markdown;
}
