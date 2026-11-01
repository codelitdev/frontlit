import React from "react";
import type { Extensions, JSONContent } from "@tiptap/core";
import { Node as TiptapNode } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from "@tiptap/react";
import { Fragment } from "@tiptap/pm/model";
import { Plus, Trash2, X } from "lucide-react";
import { CALLOUT_TYPES, type TypeTableRow } from "../docs/blocks";

const input =
  "h-7 min-w-0 rounded border border-input bg-card px-2 text-xs text-foreground placeholder:text-muted-foreground";
const smallButton =
  "inline-flex h-7 items-center gap-1 rounded px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40";

const paragraph = (text = ""): JSONContent =>
  text
    ? { type: "paragraph", content: [{ type: "text", text }] }
    : { type: "paragraph" };

/** Content inserted from the toolbar's Insert menu. */
export const docsBlockTemplates: Record<
  string,
  { label: string; content: JSONContent }
> = {
  callout: {
    label: "Callout",
    content: { type: "callout", attrs: { type: "info" }, content: [paragraph()] },
  },
  tabs: {
    label: "Tabs",
    content: {
      type: "tabs",
      content: ["Tab 1", "Tab 2"].map((label) => ({
        type: "tab",
        attrs: { label },
        content: [paragraph()],
      })),
    },
  },
  steps: {
    label: "Steps",
    content: {
      type: "steps",
      content: [
        {
          type: "step",
          content: [{ type: "heading", attrs: { level: 3 } }, paragraph()],
        },
      ],
    },
  },
  cards: {
    label: "Cards",
    content: { type: "cards", content: [{ type: "card", attrs: { title: "Card" } }] },
  },
  accordions: {
    label: "Accordion",
    content: {
      type: "accordions",
      content: [
        { type: "accordion", attrs: { title: "Question" }, content: [paragraph()] },
      ],
    },
  },
  codeGroup: {
    label: "Code group",
    content: {
      type: "codeGroup",
      content: [
        { type: "codeBlock", attrs: { language: "bash", title: "Terminal" } },
        { type: "codeBlock", attrs: { language: "ts", title: "index.ts" } },
      ],
    },
  },
  typeTable: {
    label: "Type table",
    content: {
      type: "typeTable",
      attrs: {
        rows: [
          {
            name: "name",
            type: "string",
            default: null,
            description: null,
            required: false,
          },
        ],
      },
    },
  },
};

/** New child appended by a container's "Add" button. */
const childTemplates: Record<string, (count: number) => JSONContent> = {
  tabs: (count) => ({
    type: "tab",
    attrs: { label: `Tab ${count + 1}` },
    content: [paragraph()],
  }),
  steps: () => ({
    type: "step",
    content: [{ type: "heading", attrs: { level: 3 } }, paragraph()],
  }),
  cards: () => ({ type: "card", attrs: { title: "Card" } }),
  accordions: () => ({
    type: "accordion",
    attrs: { title: "Question" },
    content: [paragraph()],
  }),
  codeGroup: () => ({ type: "codeBlock", attrs: { language: null, title: "Code" } }),
};
const childLabels: Record<string, string> = {
  tabs: "Add tab",
  steps: "Add step",
  cards: "Add card",
  accordions: "Add item",
  codeGroup: "Add code block",
};

function BlockFrame({
  label,
  props,
  children,
  fields,
}: {
  label: string;
  props: ReactNodeViewProps;
  children?: React.ReactNode;
  fields?: React.ReactNode;
}) {
  const { node, editor, getPos, deleteNode } = props;
  const add = childTemplates[node.type.name];
  return (
    <NodeViewWrapper className="te-block" data-block={node.type.name}>
      <div className="te-block__bar" contentEditable={false}>
        <span className="te-block__label">{label}</span>
        {fields}
        <span className="ml-auto flex items-center gap-1">
          {add && editor.isEditable && (
            <button
              type="button"
              className={smallButton}
              onClick={() => {
                // Read the container from the current state: the view's `node`
                // can predate edits inside it, and a stale size would put the
                // child inside the last item, where insertContentAt re-fits
                // (wraps) the surrounding content instead of failing.
                const pos = getPos();
                const current =
                  typeof pos === "number" ? editor.state.doc.nodeAt(pos) : null;
                if (typeof pos !== "number" || current?.type !== node.type) return;
                const child = editor.schema.nodeFromJSON(add(current.childCount));
                const end = current.childCount;
                if (!current.canReplace(end, end, Fragment.from(child))) return;
                const at = pos + current.nodeSize - 1;
                editor.view.dispatch(
                  editor.state.tr.insert(at, child).scrollIntoView(),
                );
                editor.view.focus();
              }}
            >
              <Plus className="size-3.5" />
              {childLabels[node.type.name]}
            </button>
          )}
          {editor.isEditable && (
            <button
              type="button"
              className={smallButton}
              aria-label={`Remove ${label.toLowerCase()}`}
              title={`Remove ${label.toLowerCase()}`}
              onClick={deleteNode}
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </span>
      </div>
      {children ?? <NodeViewContent className="te-block__content" />}
    </NodeViewWrapper>
  );
}

/** A tab, step, card or accordion item: optional fields, removable unless it is the last one. */
function ItemFrame({
  props,
  fields,
}: {
  props: ReactNodeViewProps;
  fields?: React.ReactNode;
}) {
  const { editor, getPos, deleteNode, node } = props;
  const pos = getPos();
  const parent = typeof pos === "number" ? editor.state.doc.resolve(pos).parent : null;
  return (
    <NodeViewWrapper className="te-block-item" data-block={node.type.name}>
      {(fields || (parent?.childCount ?? 0) > 1) && (
        <div className="te-block__bar" contentEditable={false}>
          {fields}
          {(parent?.childCount ?? 0) > 1 && editor.isEditable && (
            <button
              type="button"
              className={`${smallButton} ml-auto`}
              aria-label="Remove item"
              title="Remove item"
              onClick={deleteNode}
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      )}
      <NodeViewContent className="te-block__content" />
    </NodeViewWrapper>
  );
}

function TextField({
  props,
  name,
  placeholder,
  nullable,
  className = "w-40",
}: {
  props: ReactNodeViewProps;
  name: string;
  placeholder: string;
  nullable?: boolean;
  className?: string;
}) {
  const value = (props.node.attrs[name] as string | null) ?? "";
  return (
    <input
      className={`${input} ${className}`}
      aria-label={placeholder}
      placeholder={placeholder}
      value={value}
      disabled={!props.editor.isEditable}
      onChange={(event) =>
        props.updateAttributes({
          [name]: nullable && !event.target.value ? null : event.target.value,
        })
      }
    />
  );
}

function CalloutView(props: ReactNodeViewProps) {
  return (
    <BlockFrame
      label="Callout"
      props={props}
      fields={
        <>
          <select
            className={input}
            aria-label="Callout type"
            value={props.node.attrs.type ?? "info"}
            disabled={!props.editor.isEditable}
            onChange={(event) => props.updateAttributes({ type: event.target.value })}
          >
            {CALLOUT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <TextField
            props={props}
            name="title"
            placeholder="Title (optional)"
            nullable
          />
        </>
      }
    />
  );
}

function CodeBlockView(props: ReactNodeViewProps) {
  return (
    <NodeViewWrapper className="te-block-code">
      <div className="te-block__bar" contentEditable={false}>
        <TextField props={props} name="title" placeholder="File name" nullable />
        <TextField
          props={props}
          name="language"
          placeholder="Language"
          nullable
          className="w-24"
        />
      </div>
      <pre>
        <NodeViewContent<"code"> as="code" />
      </pre>
    </NodeViewWrapper>
  );
}

function TypeTableView(props: ReactNodeViewProps) {
  const rows = (props.node.attrs.rows ?? []) as TypeTableRow[];
  const editable = props.editor.isEditable;
  const update = (index: number, patch: Partial<TypeTableRow>) =>
    props.updateAttributes({
      rows: rows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    });
  const text = (index: number, key: "name" | "type" | "default" | "description") => (
    <input
      className={`${input} w-full`}
      aria-label={key}
      placeholder={key}
      value={rows[index][key] ?? ""}
      disabled={!editable}
      onChange={(event) =>
        update(index, {
          [key]:
            (key === "default" || key === "description") && !event.target.value
              ? null
              : event.target.value,
        })
      }
    />
  );
  return (
    <BlockFrame label="Type table" props={props}>
      <div contentEditable={false} className="te-block__content">
        <table className="te-block-table">
          <thead>
            <tr>
              <th>Prop</th>
              <th>Type</th>
              <th>Default</th>
              <th>Description</th>
              <th>Required</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: row names are edited in place.
              <tr key={index}>
                <td>{text(index, "name")}</td>
                <td>{text(index, "type")}</td>
                <td>{text(index, "default")}</td>
                <td>{text(index, "description")}</td>
                <td>
                  <input
                    type="checkbox"
                    aria-label="Required"
                    checked={row.required}
                    disabled={!editable}
                    onChange={(event) =>
                      update(index, { required: event.target.checked })
                    }
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className={smallButton}
                    aria-label="Remove row"
                    disabled={!editable || rows.length === 1}
                    onClick={() =>
                      props.updateAttributes({
                        rows: rows.filter((_, i) => i !== index),
                      })
                    }
                  >
                    <X className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {editable && (
          <button
            type="button"
            className={smallButton}
            onClick={() =>
              props.updateAttributes({
                rows: [
                  ...rows,
                  {
                    name: `prop${rows.length + 1}`,
                    type: "string",
                    default: null,
                    description: null,
                    required: false,
                  },
                ],
              })
            }
          >
            <Plus className="size-3.5" />
            Add row
          </button>
        )}
      </div>
    </BlockFrame>
  );
}

const views: Record<string, React.ComponentType<ReactNodeViewProps>> = {
  callout: CalloutView,
  tabs: (props) => <BlockFrame label="Tabs" props={props} />,
  tab: (props) => (
    <ItemFrame
      props={props}
      fields={<TextField props={props} name="label" placeholder="Tab label" />}
    />
  ),
  steps: (props) => <BlockFrame label="Steps" props={props} />,
  step: (props) => <ItemFrame props={props} />,
  cards: (props) => <BlockFrame label="Cards" props={props} />,
  card: (props) => (
    <ItemFrame
      props={props}
      fields={
        <>
          <TextField props={props} name="title" placeholder="Title" />
          <TextField props={props} name="href" placeholder="Link (/docs/…)" nullable />
          <TextField
            props={props}
            name="icon"
            placeholder="Icon (e.g. Rocket)"
            nullable
            className="w-32"
          />
        </>
      }
    />
  ),
  accordions: (props) => <BlockFrame label="Accordion" props={props} />,
  accordion: (props) => (
    <ItemFrame
      props={props}
      fields={<TextField props={props} name="title" placeholder="Title" />}
    />
  ),
  codeGroup: (props) => <BlockFrame label="Code group" props={props} />,
  typeTable: TypeTableView,
};

/**
 * Gives the schema-only docs blocks editing UI in the browser editor. Code
 * blocks get a file-name field only in the documentation profile, so the
 * default editor keeps its syntax-highlighted code blocks.
 */
export function withDocsBlockViews(
  extensions: Extensions,
  profile: "default" | "documentation",
): Extensions {
  return extensions.map((extension) => {
    const view =
      views[extension.name] ??
      (profile === "documentation" && extension.name === "codeBlock"
        ? CodeBlockView
        : undefined);
    if (!view || !(extension instanceof TiptapNode)) return extension;
    return extension.extend({
      addNodeView() {
        return ReactNodeViewRenderer(view);
      },
    });
  });
}
