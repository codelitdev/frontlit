import { DIAGNOSTIC_CODES as CODES } from "../diagnostics";
import type { BlockSchema } from "../types";
import { attr } from "./attrs";

/** The only sandbox an embed ever gets. Never `allow-same-origin` (§10 L3). */
export const EMBED_SANDBOX = "allow-scripts allow-popups allow-forms";
export const EMBED_MIN_HEIGHT = 50;
export const EMBED_MAX_HEIGHT = 4000;
export const EMBED_DEFAULT_HEIGHT = 400;

export interface EmbedOptions {
  /** Byte cap on the embed code. Default: 64 KB. */
  maxBytes?: number;
}

/**
 * Custom HTML, CSS and JavaScript. Rendered only inside a `srcdoc` iframe with
 * `sandbox="allow-scripts allow-popups allow-forms"`. Markdown: an `html` code
 * fence inside `<Embed>`.
 */
export function embed({ maxBytes = 64 * 1024 }: EmbedOptions = {}): BlockSchema {
  const schema: BlockSchema = {
    name: "embed",
    tag: "Embed",
    group: "block",
    attrs: {
      code: {
        default: "",
        type: "string",
        markdown: false,
        validate: (v) =>
          (typeof v === "string" && new TextEncoder().encode(v).length <= maxBytes) ||
          `Embed code must be text of at most ${maxBytes} bytes.`,
        description: "HTML, CSS and JavaScript, run in a sandboxed frame.",
      },
      title: attr.optionalText("Accessible title of the frame."),
      height: attr.integer(
        "Initial frame height in pixels; the embed may resize itself up to the cap.",
        EMBED_MIN_HEIGHT,
        EMBED_MAX_HEIGHT,
      ),
    },
    fromMarkdown(element, ctx) {
      const attrs = ctx.attrs(element, schema);
      const children = element.children.filter((child) => child.type !== "definition");
      const [code] = children;
      if (
        children.length > 1 ||
        (code &&
          (code.type !== "code" ||
            !["html", null, undefined].includes(code.lang) ||
            code.meta))
      )
        ctx.fail(
          element,
          "<Embed> holds one ```html code block.",
          CODES.unsupportedSyntax,
        );
      return {
        type: "embed",
        attrs: { ...attrs, code: code?.type === "code" ? code.value : "" },
      };
    },
    toMarkdown(node, ctx) {
      const { code = "", ...rest } = node.attrs ?? {};
      return ctx.element(
        "Embed",
        ctx.props(schema, rest),
        code ? [{ type: "code", lang: "html", meta: null, value: code }] : [],
      );
    },
    docs: {
      summary:
        "Custom HTML, CSS and JavaScript in an html code fence, run in a sandboxed frame. It can call parent.postMessage({ height }) to resize itself.",
      example:
        '<Embed title="Signup form" height={400}>\n\n```html\n<form>…</form>\n```\n\n</Embed>',
    },
  };
  return schema;
}
