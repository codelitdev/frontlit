"use client";

import React, { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { isInTable, selectedRect } from "@tiptap/pm/tables";
import { autoUpdate, computePosition, flip, offset, shift } from "@floating-ui/dom";
import {
  BetweenHorizontalEnd,
  BetweenHorizontalStart,
  BetweenVerticalEnd,
  BetweenVerticalStart,
  PanelTop,
  Trash2,
} from "lucide-react";

/** Where the cursor is in a table: 1-based row and column, the table's size and position. */
export interface TableCursor {
  tablePos: number;
  row: number;
  column: number;
  rows: number;
  columns: number;
  headerRow: boolean;
}

export function tableCursor(state: EditorState): TableCursor | null {
  if (!isInTable(state)) return null;
  const rect = selectedRect(state);
  const first = rect.table.firstChild;
  return {
    tablePos: rect.tableStart - 1,
    row: rect.top + 1,
    column: rect.left + 1,
    rows: rect.map.height,
    columns: rect.map.width,
    headerRow: Boolean(
      first?.childCount &&
        Array.from({ length: first.childCount }).every(
          (_, index) => first.child(index).type.spec.tableRole === "header_cell",
        ),
    ),
  };
}

const button =
  "inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded px-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40 aria-pressed:bg-muted aria-pressed:text-foreground aria-pressed:ring-1 aria-pressed:ring-inset aria-pressed:ring-foreground/60";

/** The bar's controls, from the current cell: what they say and what they run. */
export function tableActions(cursor: TableCursor, headerToggle: boolean) {
  const { row, column, rows, columns } = cursor;
  return [
    {
      id: "rowAbove",
      label: "Insert row above",
      icon: BetweenHorizontalStart,
      run: (e: Editor) => e.chain().focus().addRowBefore().run(),
    },
    {
      id: "rowBelow",
      label: "Insert row below",
      icon: BetweenHorizontalEnd,
      run: (e: Editor) => e.chain().focus().addRowAfter().run(),
    },
    // The last row or column can't be deleted on its own; "Delete table" does that.
    {
      id: "deleteRow",
      label: `Delete row ${row}`,
      text: "Row",
      icon: Trash2,
      disabled: rows <= 1,
      run: (e: Editor) => e.chain().focus().deleteRow().run(),
      separatorAfter: true,
    },
    {
      id: "columnLeft",
      label: "Insert column left",
      icon: BetweenVerticalStart,
      run: (e: Editor) => e.chain().focus().addColumnBefore().run(),
    },
    {
      id: "columnRight",
      label: "Insert column right",
      icon: BetweenVerticalEnd,
      run: (e: Editor) => e.chain().focus().addColumnAfter().run(),
    },
    {
      id: "deleteColumn",
      label: `Delete column ${column}`,
      text: "Column",
      icon: Trash2,
      disabled: columns <= 1,
      run: (e: Editor) => e.chain().focus().deleteColumn().run(),
      separatorAfter: true,
    },
    ...(headerToggle
      ? [
          {
            id: "headerRow",
            label: "Header row",
            icon: PanelTop,
            pressed: cursor.headerRow,
            run: (e: Editor) => e.chain().focus().toggleHeaderRow().run(),
          },
        ]
      : []),
    {
      id: "deleteTable",
      label: "Delete table",
      text: "Table",
      icon: Trash2,
      run: (e: Editor) => e.chain().focus().deleteTable().run(),
    },
  ] as {
    id: string;
    label: string;
    text?: string;
    icon: typeof Trash2;
    disabled?: boolean;
    pressed?: boolean;
    separatorAfter?: boolean;
    run(editor: Editor): boolean;
  }[];
}

/** Focus the table bar's first control, if the cursor is in a table. Used by Alt-F10. */
export function focusTableBar(editor: Editor): boolean {
  if (!isInTable(editor.state)) return false;
  const control = editor.view.dom.parentElement
    ?.closest(".tiptap-editor")
    ?.querySelector<HTMLElement>(".te-table-bar button:not([disabled])");
  if (!control) return false;
  control.focus();
  return true;
}

/**
 * Controls for the table the cursor is in, shown above it: insert and delete
 * rows and columns, the header row (rich tables; Markdown tables always have
 * one) and delete the table. A toolbar: Alt-F10 from the table reaches it,
 * arrows move between controls and Escape returns to the cell.
 */
export function TableBar({
  editor,
  headerToggle,
}: {
  editor: Editor;
  headerToggle: boolean;
}) {
  const [cursor, setCursor] = useState<TableCursor | null>(() =>
    editor.isEditable ? tableCursor(editor.state) : null,
  );
  const bar = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const update = () => {
      const next = editor.isEditable ? tableCursor(editor.state) : null;
      setCursor((current) =>
        JSON.stringify(current) === JSON.stringify(next) ? current : next,
      );
    };
    editor.on("transaction", update);
    return () => {
      editor.off("transaction", update);
    };
  }, [editor]);
  const tablePos = cursor?.tablePos;
  useEffect(() => {
    const element = bar.current;
    if (tablePos === undefined || !element) return undefined;
    const reference = editor.view.nodeDOM(tablePos);
    if (!(reference instanceof HTMLElement)) return undefined;
    return autoUpdate(reference, element, () => {
      void computePosition(reference, element, {
        placement: "top-start",
        strategy: "absolute",
        middleware: [offset(4), flip({ padding: 8 }), shift({ padding: 8 })],
      }).then(({ x, y }) => {
        element.style.left = `${x}px`;
        element.style.top = `${y}px`;
      });
    });
  }, [editor, tablePos]);
  if (!cursor) return null;
  const actions = tableActions(cursor, headerToggle);
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      editor.view.focus();
      return;
    }
    const controls = Array.from(
      bar.current?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? [],
    );
    const at = controls.indexOf(document.activeElement as HTMLElement);
    const to =
      event.key === "ArrowRight"
        ? (at + 1) % controls.length
        : event.key === "ArrowLeft"
          ? (at - 1 + controls.length) % controls.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? controls.length - 1
              : null;
    if (to === null || at === -1) return;
    event.preventDefault();
    controls[to]?.focus();
  };
  return (
    <div
      ref={bar}
      role="toolbar"
      aria-label={`Table, row ${cursor.row} of ${cursor.rows}, column ${cursor.column} of ${cursor.columns}`}
      className="te-popover te-table-bar absolute left-0 top-0 z-20 flex items-center gap-0.5 rounded-md p-0.5 shadow-md"
      onKeyDown={onKeyDown}
    >
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <React.Fragment key={action.id}>
            <button
              type="button"
              className={button}
              aria-label={action.label}
              title={action.label}
              aria-pressed={action.pressed}
              disabled={action.disabled}
              // Keep the cell selection; the command refocuses the editor.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => action.run(editor)}
            >
              <Icon className="size-3.5" aria-hidden />
              {action.text && <span aria-hidden>{action.text}</span>}
            </button>
            {action.separatorAfter && (
              <span
                role="separator"
                aria-orientation="vertical"
                className="mx-0.5 h-4 w-px bg-border"
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
