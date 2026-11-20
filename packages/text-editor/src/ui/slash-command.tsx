"use client";

import React, { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";
import { computePosition, flip, offset, shift } from "@floating-ui/dom";
import { filterInsertItems, type InsertItem } from "./insert-items";

interface MenuProps {
  items: InsertItem[];
  command(item: InsertItem): void;
}
export interface MenuHandle {
  onKeyDown(event: KeyboardEvent): boolean;
}

/** The `/` insert menu: entries filtered as you type; unavailable ones greyed out with the reason. */
export const InsertMenu = forwardRef<MenuHandle, MenuProps>(function InsertMenu(
  { items, command },
  ref,
) {
  const [active, setActive] = useState(0);
  useEffect(() => setActive(0), [items]);
  const usable = (index: number) => items[index] && !items[index].unavailable;
  const move = (step: number) => {
    if (!items.length) return;
    let next = active;
    for (let i = 0; i < items.length; i++) {
      next = (next + step + items.length) % items.length;
      if (usable(next)) break;
    }
    setActive(next);
  };
  useImperativeHandle(ref, () => ({
    onKeyDown(event) {
      if (event.key === "ArrowDown") {
        move(1);
        return true;
      }
      if (event.key === "ArrowUp") {
        move(-1);
        return true;
      }
      if (event.key === "Enter") {
        if (usable(active)) command(items[active]);
        return true;
      }
      return false;
    },
  }));
  return (
    <div
      className="te-popover te-insert-menu w-64 rounded-md p-1 shadow-lg"
      role="listbox"
    >
      {items.length === 0 && (
        <div className="px-2.5 py-2 text-sm text-muted-foreground">
          No matching blocks
        </div>
      )}
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <button
            key={`${item.name}-${item.label}`}
            type="button"
            role="option"
            aria-selected={index === active}
            aria-disabled={Boolean(item.unavailable)}
            title={item.unavailable}
            className={`flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm ${
              item.unavailable
                ? "cursor-not-allowed opacity-50"
                : index === active
                  ? "bg-muted"
                  : "hover:bg-muted"
            }`}
            onMouseEnter={() => !item.unavailable && setActive(index)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => !item.unavailable && command(item)}
          >
            <Icon className="size-4 shrink-0" />
            <span className="flex min-w-0 flex-col">
              <span>{item.label}</span>
              {item.unavailable && (
                <span className="truncate text-xs text-muted-foreground">
                  {item.unavailable}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
});

export const slashCommandKey = new PluginKey("slashCommand");

/** Typing `/` opens the insert menu at the cursor. */
export function createSlashCommand(getItems: () => InsertItem[]) {
  return Extension.create({
    name: "slashCommand",
    addProseMirrorPlugins() {
      return [
        Suggestion<InsertItem, InsertItem>({
          editor: this.editor,
          char: "/",
          pluginKey: slashCommandKey,
          allow: ({ state, range }) =>
            !state.doc.resolve(range.from).parent.type.spec.code,
          items: ({ query }) => filterInsertItems(getItems(), query).slice(0, 30),
          command: ({ editor, range, props }) => {
            if (!props.unavailable) props.run(editor, range);
          },
          render: () => {
            let renderer: ReactRenderer<MenuHandle, MenuProps> | null = null;
            const place = (props: SuggestionProps<InsertItem, InsertItem>) => {
              const rect = props.clientRect?.();
              const element = renderer?.element as HTMLElement | undefined;
              if (!rect || !element) return;
              element.style.position = "fixed";
              element.style.zIndex = "50";
              void computePosition({ getBoundingClientRect: () => rect }, element, {
                placement: "bottom-start",
                strategy: "fixed",
                middleware: [offset(6), flip(), shift({ padding: 8 })],
              }).then(({ x, y }) => {
                element.style.left = `${x}px`;
                element.style.top = `${y}px`;
              });
            };
            return {
              onStart(props) {
                renderer = new ReactRenderer(InsertMenu, {
                  editor: props.editor,
                  props: { items: props.items, command: props.command },
                });
                document.body.appendChild(renderer.element);
                place(props);
              },
              onUpdate(props) {
                renderer?.updateProps({ items: props.items, command: props.command });
                place(props);
              },
              onKeyDown({ event }) {
                if (event.key === "Escape") {
                  renderer?.element.remove();
                  return true;
                }
                return renderer?.ref?.onKeyDown(event) ?? false;
              },
              onExit() {
                renderer?.element.remove();
                renderer?.destroy();
                renderer = null;
              },
            };
          },
        }),
      ];
    },
  });
}
