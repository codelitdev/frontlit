import type { Editor, Range } from "@tiptap/core";
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
  group: "text" | "blocks";
  /** Why the item can't be used now (availability); shown greyed out. */
  unavailable?: string;
  run(editor: Editor, range?: Range): void;
}

const HEADING_ICONS = [Heading1, Heading2, Heading3, Heading4, Heading5, Heading6];

/** Deletes the typed `/query` (when inserting from the slash menu) and focuses. */
const chain = (editor: Editor, range?: Range) => {
  const c = editor.chain().focus();
  return range ? c.deleteRange(range) : c;
};

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
      group: "text",
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
        group: "text",
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
      group: "text",
      run: (editor, range) => chain(editor, range).toggleBulletList().run(),
    });
  if (has("orderedList"))
    items.push({
      name: "orderedList",
      label: "Numbered list",
      icon: ListOrdered,
      keywords: ["ordered", "ol", "1."],
      group: "text",
      run: (editor, range) => chain(editor, range).toggleOrderedList().run(),
    });
  if (has("blockquote"))
    items.push({
      name: "blockquote",
      label: "Quote",
      icon: Quote,
      keywords: ["blockquote", "citation"],
      group: "text",
      run: (editor, range) => chain(editor, range).toggleBlockquote().run(),
    });
  if (has("codeBlock"))
    items.push({
      name: "codeBlock",
      label: "Code block",
      icon: Code,
      keywords: ["code", "snippet", "pre", "```"],
      group: "text",
      run: (editor, range) => chain(editor, range).toggleCodeBlock().run(),
    });
  if (has("horizontalRule"))
    items.push({
      name: "horizontalRule",
      label: "Divider",
      icon: Minus,
      keywords: ["horizontal rule", "hr", "separator", "---"],
      group: "text",
      run: (editor, range) => chain(editor, range).setHorizontalRule().run(),
    });
  if (has("table"))
    items.push({
      name: "table",
      label: "Table",
      icon: Table,
      keywords: ["grid", "rows", "columns"],
      group: "text",
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
    const { label, icon, keywords } = ui.insert;
    items.push({
      name: block.name,
      label,
      icon,
      keywords,
      group: "blocks",
      unavailable: options.unavailable?.[block.name],
      run:
        block.name === "image" && options.insertImage
          ? (editor, range) => {
              if (range) editor.chain().focus().deleteRange(range).run();
              options.insertImage!(editor);
            }
          : (editor, range) =>
              chain(editor, range).insertContent(ui.insert.create()).run(),
    });
  }
  return items;
}

/** Items whose label or keywords start with (or contain) every typed word. */
export function filterInsertItems(items: InsertItem[], query: string): InsertItem[] {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return items;
  return items.filter((item) => {
    const haystack = [item.label, item.name, ...item.keywords].join(" ").toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}
