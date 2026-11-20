import type { Editor, JSONContent, Range } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import {
  Code,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Table,
} from "lucide-react";
import type { Profile } from "../core/types";
import type { BlockUi, Icon } from "./types";

export interface InsertItem {
  /** Block or base node name. */
  name: string;
  label: string;
  icon: Icon;
  keywords: string[];
  /** One line under the label in the `/` menu. */
  description?: string;
  /** Menu section heading, e.g. "Text", "Media", "Layout". */
  group: string;
  /** Why the item can't be used now (availability); shown greyed out. */
  unavailable?: string;
  run(editor: Editor, range?: Range): void;
}

const HEADING_ICONS = [Heading1, Heading2, Heading3, Heading4, Heading5, Heading6];
const HEADING_DESCRIPTIONS = [
  "Largest heading",
  "Large section heading",
  "Medium section heading",
  "Small section heading",
  "Smaller heading",
  "Smallest heading",
];

/** Deletes the typed `/query` (when inserting from the slash menu) and focuses. */
const chain = (editor: Editor, range?: Range) => {
  const c = editor.chain().focus();
  return range ? c.deleteRange(range) : c;
};

/**
 * Inserts a block and puts the cursor in its first text field (the first tab,
 * the first step's heading), not after its last one.
 */
export function insertBlock(editor: Editor, content: JSONContent, range?: Range) {
  const start = range?.from ?? editor.state.selection.from;
  if (!chain(editor, range).insertContent(content).run()) return false;
  // Put the cursor in the new block's first text. Find the block itself: the
  // insert can leave the cursor after it (e.g. when the "/" line held more text).
  const { state } = editor;
  let block: number | null = null;
  let distance = Number.POSITIVE_INFINITY;
  state.doc.descendants((node, pos) => {
    if (node.type.name !== content.type) return true;
    if (Math.abs(pos - start) < distance) {
      distance = Math.abs(pos - start);
      block = pos;
    }
    return false;
  });
  if (block === null) return true;
  const at: number = block;
  const node = state.doc.nodeAt(at);
  if (!node) return true;
  const tr = state.tr;
  let target: number | null = node.isTextblock ? at + 1 : null;
  node.descendants((child, offset) => {
    if (target !== null) return false;
    if (child.isTextblock) {
      target = at + 1 + offset + 1;
      return false;
    }
    return true;
  });
  if (target === null) {
    // No text inside (an atom such as a button, or an empty card grid): the
    // cursor goes to the line after it, made if there is none.
    const after = at + node.nodeSize;
    const $after = state.doc.resolve(after);
    const paragraph = state.schema.nodes.paragraph;
    if (state.doc.nodeAt(after)?.isTextblock) target = after + 1;
    else if (
      paragraph &&
      $after.parent.canReplaceWith($after.index(), $after.index(), paragraph)
    ) {
      tr.insert(after, paragraph.create());
      target = after + 1;
    }
  }
  if (target !== null)
    editor.view.dispatch(
      tr.setSelection(TextSelection.create(tr.doc, target)).scrollIntoView(),
    );
  return true;
}

export interface InsertItemOptions {
  ui: ReadonlyMap<string, BlockUi>;
  unavailable?: Record<string, string>;
  /** Inserts an image the host way (picker or file upload). */
  insertImage?(editor: Editor, range?: Range): void;
  /** Heading levels offered (default: the profile's, at most 1–3 in the default menu). */
  headingLevels?: readonly number[];
}

/** Insert entries for a profile: base nodes it holds, then its blocks that have UI. */
export function getInsertItems(
  profile: Profile,
  options: InsertItemOptions,
): InsertItem[] {
  const has = (name: string) => profile.nodeNames.has(name);
  const items: InsertItem[] = [
    {
      name: "paragraph",
      label: "Text",
      icon: Pilcrow,
      keywords: ["paragraph", "plain"],
      description: "Plain paragraph",
      group: "Text",
      run: (editor, range) => chain(editor, range).setParagraph().run(),
    },
  ];
  if (has("heading"))
    for (const level of options.headingLevels ?? profile.headingLevels)
      items.push({
        name: "heading",
        label: `Heading ${level}`,
        icon: HEADING_ICONS[level - 1],
        keywords: ["title", `h${level}`, "heading"],
        description: HEADING_DESCRIPTIONS[level - 1],
        group: "Text",
        run: (editor, range) =>
          chain(editor, range)
            .setHeading({ level: level as 1 })
            .run(),
      });
  if (has("bulletList"))
    items.push({
      name: "bulletList",
      label: "Bullet list",
      icon: List,
      keywords: ["unordered", "ul", "-"],
      description: "A simple list of items",
      group: "Text",
      run: (editor, range) => chain(editor, range).toggleBulletList().run(),
    });
  if (has("orderedList"))
    items.push({
      name: "orderedList",
      label: "Numbered list",
      icon: ListOrdered,
      keywords: ["ordered", "ol", "1."],
      description: "A list with numbers",
      group: "Text",
      run: (editor, range) => chain(editor, range).toggleOrderedList().run(),
    });
  if (has("blockquote"))
    items.push({
      name: "blockquote",
      label: "Quote",
      icon: Quote,
      keywords: ["blockquote", "citation"],
      description: "Quoted text",
      group: "Text",
      run: (editor, range) => chain(editor, range).toggleBlockquote().run(),
    });
  if (has("codeBlock"))
    items.push({
      name: "codeBlock",
      label: "Code block",
      icon: Code,
      keywords: ["code", "snippet", "pre", "```"],
      description: "Code with syntax highlighting",
      group: "Text",
      run: (editor, range) => chain(editor, range).toggleCodeBlock().run(),
    });
  if (has("horizontalRule"))
    items.push({
      name: "horizontalRule",
      label: "Divider",
      icon: Minus,
      keywords: ["horizontal rule", "hr", "separator", "---"],
      description: "A line between sections",
      group: "Text",
      run: (editor, range) => chain(editor, range).setHorizontalRule().run(),
    });
  if (has("table"))
    items.push({
      name: "table",
      label: "Table",
      icon: Table,
      keywords: ["grid", "rows", "columns"],
      description: "Rows and columns",
      group: "Text",
      run: (editor, range) =>
        chain(editor, range)
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run(),
    });
  const menu = profile.options.menu;
  for (const block of profile.blocks) {
    if (menu && !menu.includes(block.name)) continue;
    const ui = options.ui.get(block.name);
    if (!ui) continue;
    const group = ui.insert.group ?? "Blocks";
    for (const entry of [ui.insert, ...(ui.variants ?? [])]) {
      const { label, icon, keywords, description } = entry;
      items.push({
        name: block.name,
        label,
        icon,
        keywords,
        description,
        group: entry.group ?? group,
        unavailable: options.unavailable?.[block.name],
        run:
          block.name === "image" && options.insertImage
            ? (editor, range) => {
                if (range) editor.chain().focus().deleteRange(range).run();
                options.insertImage!(editor);
              }
            : (editor, range) => {
                insertBlock(editor, entry.create(), range);
              },
      });
    }
  }
  // One section per group, in the order groups first appear.
  const order = [...new Set(items.map((item) => item.group))];
  return items
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        order.indexOf(a.item.group) - order.indexOf(b.item.group) || a.index - b.index,
    )
    .map(({ item }) => item);
}

/** Items whose label or keywords start with (or contain) every typed word. */
export function filterInsertItems(items: InsertItem[], query: string): InsertItem[] {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return items;
  // Entries whose label matches come before keyword-only matches, so
  // "/warning" offers "Warning callout" ahead of a callout tagged "warning".
  const rank = (item: InsertItem) => {
    const label = item.label.toLowerCase();
    if (label.startsWith(words.join(" "))) return 0;
    return words.every((word) => label.includes(word)) ? 1 : 2;
  };
  const matches = items
    .filter((item) => {
      const haystack = [item.label, item.name, ...item.keywords]
        .join(" ")
        .toLowerCase();
      return words.every((word) => haystack.includes(word));
    })
    .map((item, index) => ({ item, index, rank: rank(item) }));
  // Sections stay together (the menu draws one heading per run of a section),
  // ordered by their best match, then by where they first appear.
  const sections = new Map<string, { rank: number; order: number }>();
  for (const { item, rank } of matches) {
    const section = sections.get(item.group);
    if (!section) sections.set(item.group, { rank, order: sections.size });
    else section.rank = Math.min(section.rank, rank);
  }
  const by = (item: InsertItem) => sections.get(item.group)!;
  return matches
    .sort(
      (a, b) =>
        by(a.item).rank - by(b.item).rank ||
        by(a.item).order - by(b.item).order ||
        a.rank - b.rank ||
        a.index - b.index,
    )
    .map(({ item }) => item);
}
