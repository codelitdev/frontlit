import type { BlockSchema } from "../core/types";
import { attr } from "../core/library/attrs";
import { DIAGNOSTIC_CODES as CODES } from "../core/diagnostics";
import { quote } from "../core/literal";
import { isSafeUrl } from "../core/urls";

/**
 * Blocks only the documentation profile holds: Cards, Code group and Type
 * table. Callout, Tabs, Steps and Accordion live in the block library
 * (`src/core/library`). Schema-only: no React.
 */
export { CALLOUT_TYPES, type CalloutType } from "../core/library/text-blocks";
export { CodeBlockTitle, InlineCode as DocsCode } from "../core/extensions";

export interface TypeTableRow {
  name: string;
  type: string;
  default: string | null;
  description: string | null;
  required: boolean;
}

const ICON = /^[A-Za-z][\w-]*$/;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

const card: BlockSchema = {
  name: "card",
  tag: "Card",
  content: "block*",
  attrs: {
    title: attr.text("Card title.", { required: true }),
    href: {
      default: null,
      type: "URL",
      url: "link",
      validate: (v) => v === null || isSafeUrl(v) || "Card link URL is unsafe.",
      description: "Optional link target.",
    },
    icon: {
      default: null,
      type: "icon",
      markdown: false,
      validate: (v) =>
        v === null ||
        (typeof v === "string" && ICON.test(v)) ||
        "Card icon must be an icon name.",
      description: "A lucide icon name, written as icon={<Rocket />}.",
    },
  },
  fromMarkdown(element, ctx) {
    // Fumadocs writes icons as JSX: icon={<Rocket />}.
    let icon: string | null = null;
    const attributes = element.attributes.filter((attribute) => {
      if (attribute.type !== "mdxJsxAttribute" || attribute.name !== "icon")
        return true;
      const value = attribute.value;
      const jsx =
        value && typeof value === "object"
          ? /^\s*<([A-Za-z][\w-]*)\s*\/>\s*$/.exec(value.value)
          : null;
      if (jsx) icon = jsx[1];
      else if (typeof value === "string") icon = value;
      else
        ctx.fail(
          element,
          "<Card> prop icon must be a literal value.",
          CODES.unsupportedAttribute,
        );
      return false;
    });
    if (icon !== null && !ICON.test(icon))
      ctx.fail(element, "Card icon must be an icon name.", CODES.unsupportedAttribute);
    const attrs = ctx.attrs({ ...element, attributes }, card);
    const body = ctx.blocks(element.children);
    return {
      type: "card",
      attrs: { ...attrs, icon },
      ...(body.length ? { content: body } : {}),
    };
  },
  toMarkdown(node, ctx) {
    const a = node.attrs ?? {};
    return ctx.element(
      "Card",
      [
        ctx.prop("title", a.title),
        ctx.prop("href", a.href),
        ctx.prop("icon", a.icon ? `<${a.icon} />` : null, true),
      ],
      ctx.blocks(node.content ?? []),
    );
  },
  docs: {
    summary: "One link card of a <Cards> grid.",
    example: '<Card title="Quick start" href="/docs/quick-start" icon={<Rocket />} />',
  },
};

export function cards(): BlockSchema {
  return {
    name: "cards",
    tag: "Cards",
    group: "block",
    content: "card+",
    attrs: {},
    children: [card],
    docs: {
      summary:
        "A grid of link cards; each <Card> has a title and optional href, icon and text.",
      example:
        '<Cards>\n\n<Card title="Quick start" href="/docs/quick-start" icon={<Rocket />}>\n\nUpload your first file.\n\n</Card>\n\n</Cards>',
    },
  };
}

export function codeGroup(): BlockSchema {
  return {
    name: "codeGroup",
    tag: "CodeGroup",
    group: "block",
    content: "codeBlock+",
    attrs: {},
    fromMarkdown(element, ctx) {
      for (const child of element.children)
        if (child.type !== "code")
          ctx.fail(child, "<CodeGroup> can only contain code blocks.");
      const content = ctx.blocks(element.children);
      return {
        type: "codeGroup",
        content: content.length ? content : [{ type: "paragraph" }],
      };
    },
    docs: {
      summary: 'Code fences shown as tabs; each fence\'s title="…" is its tab label.',
      example: '<CodeGroup>\n\n```ts title="client.ts"\nupload();\n```\n\n</CodeGroup>',
    },
  };
}

const TYPE_TABLE_FIELDS = ["type", "default", "description", "required"];
const nullableString = (v: unknown) => v === null || typeof v === "string";
const record = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(v));
const typeTableRow = (v: unknown) =>
  record(v) &&
  Object.keys(v).every((key) =>
    ["name", "type", "default", "description", "required"].includes(key),
  ) &&
  typeof v.name === "string" &&
  typeof v.type === "string" &&
  nullableString(v.default) &&
  nullableString(v.description) &&
  typeof v.required === "boolean";

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

export function typeTable(): BlockSchema {
  return {
    name: "typeTable",
    tag: "TypeTable",
    group: "block",
    attrs: {
      rows: {
        default: [],
        markdown: false,
        type: "rows",
        validate: (v) =>
          Array.isArray(v) &&
          v.every(typeTableRow) &&
          new Set(v.map((row) => row.name)).size === v.length,
        description: "Rows of name, type, default, description and required.",
      },
    },
    fromMarkdown(element, ctx) {
      const p = ctx.props(element, ["type"]);
      if (element.children.length)
        ctx.fail(element, "<TypeTable> cannot have children.");
      const type = p.type;
      if (!type || typeof type !== "object" || Array.isArray(type))
        ctx.fail(
          element,
          "<TypeTable> needs a type={{ … }} prop.",
          CODES.invalidDocument,
        );
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
            ctx.fail(
              element,
              `<TypeTable> field ${field} needs a string type and only string default/description and boolean required.`,
              CODES.unsupportedAttribute,
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
    },
    toMarkdown(node, ctx) {
      return ctx.element("TypeTable", [
        ctx.prop("type", formatRows(node.attrs?.rows ?? []), true),
      ]);
    },
    // Type table rows are one attribute value; give them a fixed key order.
    normalize: (node) => ({
      ...node,
      attrs: {
        rows: (node.attrs?.rows ?? []).map((row: TypeTableRow) => ({
          name: row.name,
          type: row.type,
          default: row.default,
          description: row.description,
          required: row.required,
        })),
      },
    }),
    docs: {
      summary: "A table of props or options with their types and defaults.",
      example:
        '<TypeTable\n  type={{\n    apiKey: { type: "string", default: "KEY", description: "Your key." },\n  }}\n/>',
    },
  };
}
