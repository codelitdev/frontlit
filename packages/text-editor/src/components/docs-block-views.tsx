"use client";

import React from "react";
import type { ReactNodeViewProps } from "@tiptap/react";
import { Braces, LayoutGrid, SquareCode } from "lucide-react";
import { Plus, X } from "lucide-react";
import {
  BlockFrame,
  inputClass as input,
  ItemFrame,
  smallButton,
  TextField,
} from "../ui/block-frame";
import type { BlockUi } from "../ui/types";
import { cards, codeGroup, typeTable, type TypeTableRow } from "../docs/blocks";

/**
 * Editing UI of the docs-only blocks. Callout, Tabs, Steps and Accordion get
 * theirs from the block library (`src/ui/library-ui.tsx`).
 */
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

const cardsSchema = cards();
const cardSchema = cardsSchema.children![0];

export const docsBlockUi: BlockUi[] = [
  {
    schema: cardsSchema,
    insert: {
      label: "Cards",
      icon: LayoutGrid,
      keywords: ["links", "grid"],
      create: () => ({
        type: "cards",
        content: [{ type: "card", attrs: { title: "Card" } }],
      }),
    },
    view: (props) => <BlockFrame label="Cards" props={props} />,
    addChild: {
      label: "Add card",
      create: () => ({ type: "card", attrs: { title: "Card" } }),
    },
  },
  {
    schema: cardSchema,
    insert: {
      label: "Card",
      icon: LayoutGrid,
      keywords: [],
      create: () => ({ type: "card" }),
    },
    view: (props) => (
      <ItemFrame
        props={props}
        fields={
          <>
            <TextField props={props} name="title" placeholder="Title" />
            <TextField
              props={props}
              name="href"
              placeholder="Link (/docs/…)"
              nullable
            />
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
  },
  {
    schema: codeGroup(),
    insert: {
      label: "Code group",
      icon: SquareCode,
      keywords: ["code", "tabs", "snippets"],
      create: () => ({
        type: "codeGroup",
        content: [
          { type: "codeBlock", attrs: { language: "bash", title: "Terminal" } },
          { type: "codeBlock", attrs: { language: "ts", title: "index.ts" } },
        ],
      }),
    },
    view: (props) => <BlockFrame label="Code group" props={props} />,
    addChild: {
      label: "Add code block",
      create: () => ({ type: "codeBlock", attrs: { language: null, title: "Code" } }),
    },
  },
  {
    schema: typeTable(),
    insert: {
      label: "Type table",
      icon: Braces,
      keywords: ["props", "options", "api"],
      create: () => ({
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
      }),
    },
    view: TypeTableView,
  },
];
