/**
 * Every piece of text the editor and the renderer show. Pass a partial set as
 * `labels` to `Editor`, `TextRenderer` or `ContentRenderer` to translate them;
 * the rest stay English. Text with a value in it is a function, so any
 * translator can be used.
 *
 * Server-safe: no React context here (the renderer runs as a server component).
 */
export type TextEditorLabels = {
  /** Accessible name of the editing area, unless the `ariaLabel` prop is given. */
  editorAriaLabel: string;
  /** Shown in an empty editor, unless the `placeholder` prop is given. */
  placeholder: string;

  // Toolbar and selection menu
  undo: string;
  redo: string;
  paragraph: string;
  heading: (level: number) => string;
  bold: string;
  italic: string;
  underline: string;
  strikethrough: string;
  inlineCode: string;
  insertLink: string;
  editLink: string;
  bulletList: string;
  numberedList: string;
  blockquote: string;
  /** The toolbar's Insert menu button. */
  insert: string;
  uploadingImage: string;
  wordCount: (count: number) => string;
  readTime: (minutes: number) => string;
  /** Accessible name of the selection formatting menu. */
  textFormatting: string;

  // Link editor
  linkUrl: string;
  linkPlaceholder: string;
  cancel: string;
  remove: string;
  apply: string;
  cancelLinkEditing: string;
  removeLink: string;
  applyLink: string;

  // Insert (`/`) menu
  insertBlock: string;
  noMatchingBlocks: string;
  menuNavigate: string;
  menuInsert: string;
  menuClose: string;
  textGroup: string;
  mediaGroup: string;
  text: string;
  textDescription: string;
  headingDescription: (level: number) => string;
  bulletListDescription: string;
  numberedListDescription: string;
  quote: string;
  quoteDescription: string;
  codeBlock: string;
  codeBlockDescription: string;
  divider: string;
  dividerDescription: string;
  /** The Table insert entry and the table bar's delete-table button. */
  table: string;
  tableDescription: string;
  image: string;
  imageDescription: string;

  // Table bar
  tableToolbar: (cursor: {
    row: number;
    rows: number;
    column: number;
    columns: number;
  }) => string;
  insertRowAbove: string;
  insertRowBelow: string;
  deleteRow: (row: number) => string;
  row: string;
  insertColumnLeft: string;
  insertColumnRight: string;
  deleteColumn: (column: number) => string;
  column: string;
  headerRow: string;
  deleteTable: string;

  /** Tooltip of the block drag handle. */
  dragHandle: string;

  // Messages passed to `onError`
  imageNeedsLibrary: string;
  imageTooLarge: string;
  imagesNotAllowed: string;

  // Rendered content
  copy: string;
  copied: string;
  copyCode: string;
  /** Tab of an untitled code block in a code group; `index` starts at 1. */
  codeTab: (index: number) => string;
  embeddedContent: string;
  video: string;
  h5pActivity: string;
  pdf: string;
  openPdf: string;
  downloadFile: string;
  typeTableProp: string;
  typeTableType: string;
  typeTableDefault: string;
  typeTableDescription: string;
  typeTableRequired: string;
};

const HEADING_DESCRIPTIONS = [
  "Largest heading",
  "Large section heading",
  "Medium section heading",
  "Small section heading",
  "Smaller heading",
  "Smallest heading",
];

export const defaultTextEditorLabels: TextEditorLabels = {
  editorAriaLabel: "Rich text editor",
  placeholder: "Write something…",

  undo: "Undo",
  redo: "Redo",
  paragraph: "Paragraph",
  heading: (level) => `Heading ${level}`,
  bold: "Bold",
  italic: "Italic",
  underline: "Underline",
  strikethrough: "Strikethrough",
  inlineCode: "Inline code",
  insertLink: "Insert link",
  editLink: "Edit link",
  bulletList: "Bullet list",
  numberedList: "Numbered list",
  blockquote: "Blockquote",
  insert: "Insert",
  uploadingImage: "Uploading image…",
  wordCount: (count) => `${count.toLocaleString()} ${count === 1 ? "word" : "words"}`,
  readTime: (minutes) => `${minutes} min`,
  textFormatting: "Text formatting",

  linkUrl: "Link URL",
  linkPlaceholder: "https://example.com",
  cancel: "Cancel",
  remove: "Remove",
  apply: "Apply",
  cancelLinkEditing: "Cancel link editing",
  removeLink: "Remove link",
  applyLink: "Apply link",

  insertBlock: "Insert block",
  noMatchingBlocks: "No matching blocks",
  menuNavigate: "navigate",
  menuInsert: "insert",
  menuClose: "close",
  textGroup: "Text",
  mediaGroup: "Media",
  text: "Text",
  textDescription: "Plain paragraph",
  headingDescription: (level) => HEADING_DESCRIPTIONS[level - 1] ?? "",
  bulletListDescription: "A simple list of items",
  numberedListDescription: "A list with numbers",
  quote: "Quote",
  quoteDescription: "Quoted text",
  codeBlock: "Code block",
  codeBlockDescription: "Code with syntax highlighting",
  divider: "Divider",
  dividerDescription: "A line between sections",
  table: "Table",
  tableDescription: "Rows and columns",
  image: "Image",
  imageDescription: "Upload or pick an image",

  tableToolbar: ({ row, rows, column, columns }) =>
    `Table, row ${row} of ${rows}, column ${column} of ${columns}`,
  insertRowAbove: "Insert row above",
  insertRowBelow: "Insert row below",
  deleteRow: (row) => `Delete row ${row}`,
  row: "Row",
  insertColumnLeft: "Insert column left",
  insertColumnRight: "Insert column right",
  deleteColumn: (column) => `Delete column ${column}`,
  column: "Column",
  headerRow: "Header row",
  deleteTable: "Delete table",

  dragHandle: "Drag to move (or Ctrl/⌘+Shift+↑/↓)",

  imageNeedsLibrary:
    "Upload a public image using the media library before inserting it.",
  imageTooLarge: "File is larger than the allowed size",
  imagesNotAllowed: "Images are not allowed here.",

  copy: "Copy",
  copied: "Copied",
  copyCode: "Copy code",
  codeTab: (index) => `Code ${index}`,
  embeddedContent: "Embedded content",
  video: "Video",
  h5pActivity: "H5P activity",
  pdf: "PDF",
  openPdf: "Open PDF",
  downloadFile: "Download file",
  typeTableProp: "Prop",
  typeTableType: "Type",
  typeTableDefault: "Default",
  typeTableDescription: "Description",
  typeTableRequired: "(required)",
};

/**
 * Built-in block components passed to `ContentRenderer` as `blocks` (the docs
 * blocks) that take the resolved labels as a `labels` prop. Host blocks never
 * get it: they may be client components, which can't receive functions.
 */
export const blocksTakingLabels = new WeakSet<object>();

/** The defaults with `labels` laid over them (`undefined` entries are ignored). */
export function resolveTextEditorLabels(
  labels?: Partial<TextEditorLabels>,
): TextEditorLabels {
  if (!labels) return defaultTextEditorLabels;
  const resolved = { ...defaultTextEditorLabels };
  for (const [key, value] of Object.entries(labels)) {
    if (value !== undefined) (resolved as Record<string, unknown>)[key] = value;
  }
  return resolved;
}
