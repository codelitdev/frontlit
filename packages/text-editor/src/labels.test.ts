import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Editor } from "@tiptap/core";
import { TextRenderer } from "./text-renderer";
import { defaultProfile } from "./profiles";
import { defineProfile } from "./core/profile";
import { embed } from "./core/library";
import { codeGroup, typeTable } from "./docs/blocks";
import { collectBlockUi } from "./ui/editor-extensions";
import { getInsertItems } from "./ui/insert-items";
import { tableActions } from "./ui/table-bar";
import { InsertMenu } from "./ui/slash-command";
import { DragHandle } from "./ui/drag-handle";
import Toolbar from "./toolbar";
import BubbleMenu from "./bubble-menu";
import LinkEditorPopover from "./components/link-editor-popover";
import { TextEditorLabelsContext } from "./labels-context";
import {
  defaultTextEditorLabels,
  resolveTextEditorLabels,
  type TextEditorLabels,
} from "./labels";

const doc = (...content: unknown[]) => ({ type: "doc", content });
const paragraph = (text: string) => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});

/** Renders `element` inside the editor's labels, as `Editor` does. */
const inEditor = (element: React.ReactElement, labels?: Partial<TextEditorLabels>) =>
  renderToStaticMarkup(
    React.createElement(
      TextEditorLabelsContext.Provider,
      { value: resolveTextEditorLabels(labels) },
      element,
    ),
  );

/** Enough of a Tiptap editor for the toolbar and menus to render on the server. */
const editor = {
  can: () => ({ undo: () => false, redo: () => false }),
  isActive: () => false,
  on: () => {},
  off: () => {},
  getText: () => "",
  getAttributes: () => ({}),
} as unknown as Editor;

const spanish: Partial<TextEditorLabels> = {
  undo: "Deshacer",
  paragraph: "Párrafo",
  heading: (level) => `Encabezado ${level}`,
  bold: "Negrita",
  insertLink: "Insertar enlace",
  insert: "Insertar",
  wordCount: (count) => `${count} ${count === 1 ? "palabra" : "palabras"}`,
  readTime: (minutes) => `${minutes} min de lectura`,
  textFormatting: "Formato de texto",
  linkUrl: "URL del enlace",
  apply: "Aplicar",
  insertBlock: "Insertar bloque",
  noMatchingBlocks: "Ningún bloque coincide",
  menuClose: "cerrar",
  textGroup: "Texto",
  mediaGroup: "Multimedia",
  text: "Texto",
  headingDescription: (level) => `Título de nivel ${level}`,
  image: "Imagen",
  imageDescription: "Sube o elige una imagen",
  deleteRow: (row) => `Eliminar fila ${row}`,
  copy: "Copiar",
  copyCode: "Copiar código",
  codeTab: (index) => `Código ${index}`,
  embeddedContent: "Contenido incrustado",
  typeTableProp: "Propiedad",
  typeTableRequired: "(obligatorio)",
};

const items = (labels?: Partial<TextEditorLabels>) =>
  getInsertItems(defaultProfile, {
    ui: collectBlockUi(defaultProfile),
    headingLevels: [1, 2, 3],
    labels,
  });

const rendered = doc(
  {
    type: "codeBlock",
    attrs: { language: "js" },
    content: [{ type: "text", text: "1" }],
  },
  { type: "embed", attrs: { code: "<b>x</b>" } },
  {
    type: "codeGroup",
    content: [{ type: "codeBlock", attrs: { language: null, title: null } }],
  },
  {
    type: "typeTable",
    attrs: {
      rows: [
        { name: "a", type: "string", default: null, required: true, description: null },
      ],
    },
  },
);

describe("editor labels", () => {
  it("keeps the English toolbar, menus and link editor without labels", () => {
    const toolbar = inEditor(
      React.createElement(Toolbar, { editor, profile: defaultProfile, items: items() }),
    );
    for (const text of [
      'aria-label="Undo"',
      'aria-label="Redo"',
      ">Paragraph<",
      'aria-label="Bold"',
      'aria-label="Inline code"',
      'aria-label="Insert link"',
      'aria-label="Bullet list"',
      'aria-label="Numbered list"',
      'aria-label="Blockquote"',
      "Insert</button>",
      "0 words",
      "0 min",
    ])
      expect(toolbar).toContain(text);

    const bubble = inEditor(
      React.createElement(BubbleMenu, { editor, profile: defaultProfile }),
    );
    expect(bubble).toContain('aria-label="Text formatting"');
    expect(bubble).toContain('aria-label="Strikethrough"');

    const link = inEditor(
      React.createElement(LinkEditorPopover, {
        editor: editor as never,
        onClose: () => {},
      }),
    );
    expect(link).toContain("Link URL");
    expect(link).toContain('placeholder="https://example.com"');
    expect(link).toContain("Cancel</button>");
    expect(link).toContain("Apply</button>");

    const menu = inEditor(
      React.createElement(InsertMenu, { items: items(), command: () => {} }),
    );
    expect(menu).toContain('aria-label="Insert block"');
    expect(menu).toContain(">Text<");
    expect(menu).toContain(">Plain paragraph<");
    expect(menu).toContain(">Heading 2<");
    expect(menu).toContain(">Medium section heading<");
    expect(menu).toContain(">Media<");
    expect(menu).toContain(">Image<");
    expect(menu).toContain(">Upload or pick an image<");
    expect(menu).toContain("</kbd> close");
    expect(
      inEditor(React.createElement(InsertMenu, { items: [], command: () => {} })),
    ).toContain("No matching blocks");
  });

  it("shows the labels passed in, including function labels", () => {
    const toolbar = inEditor(
      React.createElement(Toolbar, { editor, profile: defaultProfile, items: items() }),
      spanish,
    );
    expect(toolbar).toContain('aria-label="Deshacer"');
    expect(toolbar).toContain(">Párrafo<");
    expect(toolbar).toContain('aria-label="Negrita"');
    expect(toolbar).toContain("Insertar</button>");
    expect(toolbar).toContain("0 palabras");
    expect(toolbar).toContain("0 min de lectura");
    // Not translated: stays English.
    expect(toolbar).toContain('aria-label="Redo"');

    const bubble = inEditor(
      React.createElement(BubbleMenu, { editor, profile: defaultProfile }),
      spanish,
    );
    expect(bubble).toContain('aria-label="Formato de texto"');
    expect(bubble).toContain('aria-label="Insertar enlace"');

    const link = inEditor(
      React.createElement(LinkEditorPopover, {
        editor: editor as never,
        onClose: () => {},
      }),
      spanish,
    );
    expect(link).toContain("URL del enlace");
    expect(link).toContain("Aplicar</button>");

    const menu = inEditor(
      React.createElement(InsertMenu, { items: items(spanish), command: () => {} }),
      spanish,
    );
    expect(menu).toContain('aria-label="Insertar bloque"');
    expect(menu).toContain(">Texto<");
    expect(menu).toContain(">Encabezado 2<");
    expect(menu).toContain(">Título de nivel 2<");
    expect(menu).toContain(">Multimedia<");
    expect(menu).toContain(">Imagen<");
    expect(menu).toContain(">Sube o elige una imagen<");
    expect(menu).toContain("</kbd> cerrar");
    expect(menu).not.toContain(">Media<");
    expect(
      inEditor(
        React.createElement(InsertMenu, { items: [], command: () => {} }),
        spanish,
      ),
    ).toContain("Ningún bloque coincide");
  });

  it("translates insert entries, table controls and the drag handle", () => {
    const english = items();
    expect(english.map((item) => item.label)).toEqual([
      "Text",
      "Heading 1",
      "Heading 2",
      "Heading 3",
      "Bullet list",
      "Numbered list",
      "Quote",
      "Code block",
      "Divider",
      "Table",
      "Image",
    ]);
    const translated = items(spanish);
    expect(translated[0]).toMatchObject({ label: "Texto", group: "Texto" });
    expect(translated.find((item) => item.name === "image")).toMatchObject({
      label: "Imagen",
      group: "Multimedia",
    });

    const cursor = {
      tablePos: 0,
      row: 2,
      column: 1,
      rows: 3,
      columns: 2,
      headerRow: true,
    };
    expect(tableActions(cursor, true).map((action) => action.label)).toContain(
      "Delete row 2",
    );
    expect(tableActions(cursor, true, spanish).map((action) => action.label)).toContain(
      "Eliminar fila 2",
    );
    expect(defaultTextEditorLabels.tableToolbar(cursor)).toBe(
      "Table, row 2 of 3, column 1 of 2",
    );

    expect(DragHandle.options.title).toBe("Drag to move (or Ctrl/⌘+Shift+↑/↓)");
    expect(DragHandle.configure({ title: "Arrastra" }).options.title).toBe("Arrastra");
  });
});

describe("renderer labels", () => {
  const withBlocks = defineProfile({ blocks: [embed(), codeGroup(), typeTable()] });
  const render = (labels?: Partial<TextEditorLabels>) =>
    renderToStaticMarkup(
      React.createElement(TextRenderer, {
        profile: withBlocks,
        json: rendered as never,
        labels,
      }),
    );

  it("keeps the English text without labels", () => {
    const html = render();
    expect(html).toContain('aria-label="Copy code" title="Copy"');
    expect(html).toContain('title="Embedded content"');
    expect(html).toContain(">Code 1<");
    expect(html).toContain(
      "<th>Prop</th><th>Type</th><th>Default</th><th>Description</th>",
    );
    expect(html).toContain('<span class="te-type-table__required"> (required)</span>');
  });

  it("shows the labels passed in, including function labels", () => {
    const html = render(spanish);
    expect(html).toContain('aria-label="Copiar código" title="Copiar"');
    expect(html).toContain('title="Contenido incrustado"');
    expect(html).toContain(">Código 1<");
    expect(html).toContain("<th>Propiedad</th><th>Type</th>");
    expect(html).toContain(
      '<span class="te-type-table__required"> (obligatorio)</span>',
    );
    expect(html).not.toContain("Copy code");
  });
});
