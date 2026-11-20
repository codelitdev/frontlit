import { DIAGNOSTIC_CODES as CODES } from "../diagnostics";
import { quote } from "../literal";
import type { BlockSchema } from "../types";
import { attr } from "./attrs";

export const CALLOUT_TYPES = ["note", "tip", "info", "warning", "danger"] as const;
export type CalloutType = (typeof CALLOUT_TYPES)[number];

/** A highlighted note. `types` narrows the allowed kinds. */
export function callout({
  types = CALLOUT_TYPES,
}: {
  types?: readonly CalloutType[];
} = {}): BlockSchema {
  return {
    name: "callout",
    tag: "Callout",
    group: "block",
    content: "block+",
    attrs: {
      type: attr.oneOf(
        types,
        "Kind of note; the renderer picks its colour and icon. Absent means info.",
        `Callout type must be one of: ${types.join(", ")}.`,
      ),
      title: attr.optionalText("Optional heading shown above the text."),
    },
    docs: {
      summary: "A highlighted note holding any blocks.",
      example:
        '<Callout type="tip" title="Good to know">\n\nStart with three tiers.\n\n</Callout>',
    },
  };
}

const tab: BlockSchema = {
  name: "tab",
  tag: "Tab",
  content: "block+",
  attrs: { label: attr.text("Tab label.", { prop: "value" }) },
  docs: { summary: "One tab of a <Tabs> block.", example: '<Tab value="npm">…</Tab>' },
};

/** Content split into labelled tabs. */
export function tabs(): BlockSchema {
  const schema: BlockSchema = {
    name: "tabs",
    tag: "Tabs",
    group: "block",
    content: "tab+",
    attrs: {},
    children: [tab],
    fromMarkdown(element, ctx) {
      const listed = ctx.props(element, ["items"]).items;
      if (
        listed !== undefined &&
        !(Array.isArray(listed) && listed.every((item) => typeof item === "string"))
      )
        ctx.fail(
          element,
          "<Tabs> items must be a list of strings.",
          CODES.unsupportedAttribute,
        );
      const items = ctx.elements(element, ["Tab"]);
      return {
        type: "tabs",
        content: items.map((child, i) => {
          const node = ctx.child(child, schema);
          const named = child.attributes.some(
            (item) => item.type === "mdxJsxAttribute" && item.name === "value",
          );
          const value: string = named
            ? node.attrs?.label
            : ((listed as string[] | undefined)?.[i] ?? "");
          if (listed && !(listed as string[]).includes(value))
            ctx.fail(
              element,
              `Tab value "${value}" is not listed in items.`,
              CODES.invalidDocument,
            );
          return { ...node, attrs: { label: value } };
        }),
      };
    },
    toMarkdown(node, ctx) {
      const children = node.content ?? [];
      return ctx.element(
        "Tabs",
        [
          ctx.prop(
            "items",
            `[${children.map((item) => quote(item.attrs?.label ?? "")).join(", ")}]`,
            true,
          ),
        ],
        children.map((item) =>
          ctx.element(
            "Tab",
            [ctx.prop("value", item.attrs?.label ?? "")],
            ctx.blocks(item.content ?? []),
          ),
        ),
      );
    },
    docs: {
      summary: "Content split into labelled tabs; each <Tab> holds any blocks.",
      example:
        '<Tabs items={["npm", "bun"]}>\n\n<Tab value="npm">\n\nnpm install\n\n</Tab>\n\n<Tab value="bun">\n\nbun add\n\n</Tab>\n\n</Tabs>',
    },
  };
  return schema;
}

/** A numbered sequence of steps. */
export function steps(): BlockSchema {
  return {
    name: "steps",
    tag: "Steps",
    group: "block",
    content: "step+",
    attrs: {},
    children: [
      {
        name: "step",
        tag: "Step",
        content: "block+",
        attrs: {},
        docs: { summary: "One step of a <Steps> block.", example: "<Step>…</Step>" },
      },
    ],
    docs: {
      summary:
        "A numbered sequence; each <Step> holds any blocks, usually a heading first.",
      example:
        "<Steps>\n\n<Step>\n\n### Install\n\nRun the installer.\n\n</Step>\n\n</Steps>",
    },
  };
}

/** Collapsible sections (node name `accordions`, items `accordion`). */
export function accordion(): BlockSchema {
  return {
    name: "accordions",
    tag: "Accordions",
    group: "block",
    content: "accordion+",
    attrs: {
      type: attr.oneOf(
        ["single", "multiple"],
        "Whether one or several items can be open at once.",
        'Accordions type must be "single" or "multiple".',
      ),
    },
    children: [
      {
        name: "accordion",
        tag: "Accordion",
        content: "block+",
        attrs: { title: attr.text("Always-visible title.", { required: true }) },
        docs: {
          summary: "One collapsible item of an <Accordions> block.",
          example: '<Accordion title="Is it free?">…</Accordion>',
        },
      },
    ],
    docs: {
      summary:
        "Collapsible sections; each <Accordion> has a title and holds any blocks.",
      example:
        '<Accordions type="single">\n\n<Accordion title="Is it free?">\n\nYes.\n\n</Accordion>\n\n</Accordions>',
    },
  };
}
