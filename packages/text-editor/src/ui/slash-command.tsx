"use client";

import React, {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";
import {
  autoUpdate,
  computePosition,
  flip,
  offset,
  shift,
  size,
} from "@floating-ui/dom";
import { filterInsertItems, type InsertItem } from "./insert-items";

interface MenuProps {
  items: InsertItem[];
  command(item: InsertItem): void;
  /**
   * The editor's DOM. While the menu shows, it points at the list and the
   * highlighted option (`aria-controls` / `aria-activedescendant`), so a
   * screen reader announces options while focus stays in the text.
   */
  editorDom?: HTMLElement;
  hidden?: boolean;
}
export interface MenuHandle {
  onKeyDown(event: KeyboardEvent): boolean;
}

/**
 * Keys the `/` menu handles while focus stays in the editor, as the change in
 * highlighted index: a step, or `"first"` / `"last"`. Null for other keys.
 */
export function menuKeyStep(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">,
): number | "first" | "last" | null {
  if (event.altKey || event.metaKey) return null;
  if (event.ctrlKey) {
    // Emacs / macOS list keys.
    if (event.key === "n") return 1;
    if (event.key === "p") return -1;
    return null;
  }
  switch (event.key) {
    case "ArrowDown":
      return 1;
    case "ArrowUp":
      return -1;
    case "Tab":
      return event.shiftKey ? -1 : 1;
    case "PageDown":
      return 5;
    case "PageUp":
      return -5;
    case "Home":
      return "first";
    case "End":
      return "last";
    default:
      return null;
  }
}

/** The usable (not unavailable) entry a step lands on; arrows wrap, pages stop at the ends. */
export function nextMenuIndex(
  items: readonly Pick<InsertItem, "unavailable">[],
  from: number,
  step: number | "first" | "last",
): number {
  const usable = items.flatMap((item, index) => (item.unavailable ? [] : [index]));
  if (!usable.length) return from;
  if (step === "first") return usable[0];
  if (step === "last") return usable[usable.length - 1];
  const at = usable.indexOf(from);
  if (at === -1) return step > 0 ? usable[0] : usable[usable.length - 1];
  if (Math.abs(step) === 1) return usable[(at + step + usable.length) % usable.length];
  return usable[Math.min(usable.length - 1, Math.max(0, at + step))];
}

/** The `/` insert menu: entries filtered as you type; unavailable ones greyed out with the reason. */
export const InsertMenu = forwardRef<MenuHandle, MenuProps>(function InsertMenu(
  { items, command, editorDom, hidden },
  ref,
) {
  const [active, setActive] = useState(() => nextMenuIndex(items, -1, "first"));
  // Keys can arrive faster than renders; read and write the latest index here.
  const activeRef = useRef(active);
  const select = (index: number) => {
    activeRef.current = index;
    setActive(index);
  };
  const list = useRef<HTMLDivElement | null>(null);
  const id = useId();
  const optionId = (index: number) => `${id}-option-${index}`;
  useEffect(() => select(nextMenuIndex(items, -1, "first")), [items]);
  useEffect(() => {
    if (!editorDom || hidden) return undefined;
    editorDom.setAttribute("aria-controls", `${id}-list`);
    if (items[active])
      editorDom.setAttribute("aria-activedescendant", optionId(active));
    else editorDom.removeAttribute("aria-activedescendant");
    return () => {
      editorDom.removeAttribute("aria-controls");
      editorDom.removeAttribute("aria-activedescendant");
    };
  }, [editorDom, hidden, active, items]);
  // Keep the highlighted entry visible when the list scrolls.
  useEffect(() => {
    list.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active, items]);
  useImperativeHandle(ref, () => ({
    onKeyDown(event) {
      if (event.key === "Enter") {
        const item = items[activeRef.current];
        if (item && !item.unavailable) command(item);
        return true;
      }
      const step = menuKeyStep(event);
      if (step === null || !items.length) return false;
      select(nextMenuIndex(items, activeRef.current, step));
      return true;
    },
  }));
  // Items arrive ordered by group; split them into sections, keeping indexes.
  const groups: { name: string; entries: { item: InsertItem; index: number }[] }[] = [];
  items.forEach((item, index) => {
    const last = groups[groups.length - 1];
    if (last?.name === item.group) last.entries.push({ item, index });
    else groups.push({ name: item.group, entries: [{ item, index }] });
  });
  return (
    <div className="te-popover te-insert-menu flex w-80 flex-col overflow-hidden rounded-lg shadow-lg">
      <div
        ref={list}
        id={`${id}-list`}
        className="min-h-0 flex-1 overflow-y-auto p-1.5"
        role="listbox"
        aria-label="Insert block"
      >
        {items.length === 0 && (
          <div role="status" className="px-2.5 py-2 text-sm text-muted-foreground">
            No matching blocks
          </div>
        )}
        {groups.map((group, groupIndex) => (
          <div
            key={group.name}
            role="group"
            aria-labelledby={`${id}-group-${groupIndex}`}
          >
            <div
              id={`${id}-group-${groupIndex}`}
              role="presentation"
              className="te-insert-menu__group"
            >
              {group.name}
            </div>
            {group.entries.map(({ item, index }) => {
              const Icon = item.icon;
              const detail = item.unavailable ?? item.description;
              return (
                <button
                  key={`${item.name}-${item.label}`}
                  id={optionId(index)}
                  type="button"
                  role="option"
                  // The editor keeps focus; options are reached with the arrow keys.
                  tabIndex={-1}
                  aria-selected={index === active}
                  aria-disabled={Boolean(item.unavailable)}
                  aria-labelledby={`${optionId(index)}-label`}
                  aria-describedby={detail ? `${optionId(index)}-detail` : undefined}
                  title={item.unavailable}
                  className={`te-insert-menu__option flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left ${
                    item.unavailable ? "cursor-not-allowed opacity-50" : ""
                  }`}
                  // Mouse movement, not mouseenter: keyboard scrolling slides
                  // items under a resting pointer and must not steal the highlight.
                  onMouseMove={() =>
                    !item.unavailable && index !== active && select(index)
                  }
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => !item.unavailable && command(item)}
                >
                  <span className="te-insert-menu__icon" aria-hidden>
                    <Icon className="size-4" />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span
                      id={`${optionId(index)}-label`}
                      className="text-sm font-medium"
                    >
                      {item.label}
                    </span>
                    {detail && (
                      <span
                        id={`${optionId(index)}-detail`}
                        className="truncate text-xs text-muted-foreground"
                      >
                        {detail}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {/* Screen readers get the listbox semantics; the hints are for sighted users. */}
      <div className="te-insert-menu__footer" aria-hidden>
        <span>
          <kbd>↑</kbd>
          <kbd>↓</kbd> navigate
        </span>
        <span>
          <kbd>↵</kbd> insert
        </span>
        <span>
          <kbd>esc</kbd> close
        </span>
      </div>
    </div>
  );
});

export const slashCommandKey = new PluginKey("slashCommand");

/**
 * A multi-word query that matches nothing: the author is writing prose after
 * a slash ("and / or"), so the menu steps aside. One word keeps the menu open
 * with "No matching blocks", so a typo is visible.
 */
export function isProseAfterSlash(items: InsertItem[], query: string): boolean {
  return /\s/.test(query) && !filterInsertItems(items, query).length;
}

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
          // "/heading 2" filters across words; see `hidden` below.
          allowSpaces: true,
          allow: ({ state, range }) =>
            !state.doc.resolve(range.from).parent.type.spec.code,
          items: ({ query }) => filterInsertItems(getItems(), query).slice(0, 30),
          command: ({ editor, range, props }) => {
            if (!props.unavailable) props.run(editor, range);
          },
          render: () => {
            let renderer: ReactRenderer<MenuHandle, MenuProps> | null = null;
            let latest: SuggestionProps<InsertItem, InsertItem> | null = null;
            let stopAutoUpdate: (() => void) | null = null;
            // Positioned at the caret; flips above it and caps its height (then
            // scrolls) when there is no room below. `autoUpdate` re-runs this
            // when the menu resizes (its items load after it opens) or the
            // page scrolls, so it never runs off the viewport.
            const reference = {
              getBoundingClientRect: () => latest?.clientRect?.() ?? new DOMRect(),
            };
            const position = () => {
              const element = renderer?.element as HTMLElement | undefined;
              if (!element || !latest?.clientRect?.()) return;
              void computePosition(reference, element, {
                placement: "bottom-start",
                strategy: "fixed",
                middleware: [
                  offset(6),
                  flip({ padding: 8 }),
                  shift({ padding: 8 }),
                  size({
                    padding: 8,
                    apply({ availableHeight, elements }) {
                      const menu = elements.floating.firstElementChild;
                      if (!(menu instanceof HTMLElement)) return;
                      menu.style.maxHeight = `${Math.max(
                        120,
                        Math.min(360, availableHeight),
                      )}px`;
                    },
                  }),
                ],
              }).then(({ x, y }) => {
                element.style.left = `${x}px`;
                element.style.top = `${y}px`;
              });
            };
            const place = (props: SuggestionProps<InsertItem, InsertItem>) => {
              latest = props;
              const element = renderer?.element as HTMLElement | undefined;
              if (!element) return;
              element.style.position = "fixed";
              element.style.zIndex = "50";
              if (!stopAutoUpdate)
                stopAutoUpdate = autoUpdate(reference, element, position);
              position();
            };
            // Escape hides the menu until the next `/`. A multi-word query that
            // matches nothing (the author is writing prose after a slash) hides
            // it while it matches nothing. Hidden, it leaves keys to the editor.
            let escaped = false;
            let hidden = false;
            const show = (props: SuggestionProps<InsertItem, InsertItem>) => {
              // Decide from the query itself: `props.items` can still be loading.
              hidden = escaped || isProseAfterSlash(getItems(), props.query);
              const element = renderer?.element as HTMLElement | undefined;
              if (element) element.style.display = hidden ? "none" : "";
              renderer?.updateProps({ hidden });
              if (!hidden) place(props);
            };
            return {
              onStart(props) {
                escaped = false;
                renderer = new ReactRenderer(InsertMenu, {
                  editor: props.editor,
                  props: {
                    items: props.items,
                    command: props.command,
                    editorDom: props.editor.view.dom,
                  },
                });
                document.body.appendChild(renderer.element);
                show(props);
              },
              onUpdate(props) {
                renderer?.updateProps({ items: props.items, command: props.command });
                show(props);
              },
              onKeyDown({ event }) {
                if (hidden) return false;
                if (event.key === "Escape") {
                  escaped = hidden = true;
                  (renderer?.element as HTMLElement | undefined)?.style.setProperty(
                    "display",
                    "none",
                  );
                  renderer?.updateProps({ hidden });
                  return true;
                }
                return renderer?.ref?.onKeyDown(event) ?? false;
              },
              onExit() {
                stopAutoUpdate?.();
                stopAutoUpdate = null;
                latest = null;
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
