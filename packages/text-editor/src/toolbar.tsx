import React, { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import type { Level } from "@tiptap/extension-heading";
import {
  Bold,
  ChevronDown,
  Code,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List as ListIcon,
  ListOrdered,
  Minus,
  Plus,
  Quote,
  Redo2,
  Table as TableIcon,
  Trash2,
  Underline,
  Undo2,
} from "lucide-react";
import LinkEditorPopover from "./components/link-editor-popover.js";

interface ToolbarProps {
  editor: Editor | null;
  onRequestImageUpload: () => void;
  isUploadingImage?: boolean;
}

type PopoverType = "heading" | "insert" | "link" | null;

const iconButtonBase =
  "inline-flex h-8 w-8 items-center justify-center rounded border border-transparent text-foreground transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50";

function IconButton({
  icon: Icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`${iconButtonBase} ${
        active
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : "bg-transparent hover:bg-muted"
      }`}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

const headingOptions: Array<{
  label: string;
  value: string;
  level?: Level;
}> = [
  { label: "Paragraph", value: "paragraph" },
  { label: "Heading 1", value: "h1", level: 1 },
  { label: "Heading 2", value: "h2", level: 2 },
  { label: "Heading 3", value: "h3", level: 3 },
];

function Divider(): React.JSX.Element {
  return <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-border" />;
}

const Toolbar = ({
  editor,
  onRequestImageUpload,
  isUploadingImage,
}: ToolbarProps): React.JSX.Element | null => {
  const [activePopover, setActivePopover] = useState<PopoverType>(null);
  const [wordCount, setWordCount] = useState(0);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!activePopover) return undefined;

    const handleClick = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setActivePopover(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActivePopover(null);
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [activePopover]);

  useEffect(() => {
    if (!editor) return undefined;
    const updateStats = () => {
      const text = editor.getText().trim();
      setWordCount(text ? text.split(/\s+/).length : 0);
    };
    updateStats();
    editor.on("update", updateStats);
    return () => {
      editor.off("update", updateStats);
    };
  }, [editor]);

  if (!editor) return null;

  const activeHeading =
    headingOptions.find((option) =>
      option.level
        ? editor.isActive("heading", { level: option.level })
        : editor.isActive("paragraph"),
    ) ?? headingOptions[0];
  const readTime = wordCount === 0 ? 0 : Math.max(1, Math.ceil(wordCount / 200));

  const selectHeading = (level?: Level) => {
    const chain = editor.chain().focus();
    if (level) chain.setHeading({ level }).run();
    else chain.setParagraph().run();
    setActivePopover(null);
  };

  const insertTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    setActivePopover(null);
  };

  return (
    <div className="relative w-full">
      <div className="overflow-visible border-b border-border bg-card">
        <div className="flex min-h-11 flex-wrap items-center gap-1 px-4 py-1">
          <IconButton
            icon={Undo2}
            label="Undo"
            disabled={!editor.can().undo()}
            onClick={() => editor.chain().focus().undo().run()}
          />
          <IconButton
            icon={Redo2}
            label="Redo"
            disabled={!editor.can().redo()}
            onClick={() => editor.chain().focus().redo().run()}
          />
          <Divider />

          <div
            ref={activePopover === "heading" ? popoverRef : undefined}
            className="relative"
          >
            <button
              type="button"
              className="flex h-8 min-w-28 items-center justify-between gap-3 rounded border border-input bg-card px-3 text-sm font-medium hover:bg-muted"
              aria-haspopup="menu"
              aria-expanded={activePopover === "heading"}
              onClick={() =>
                setActivePopover((current) =>
                  current === "heading" ? null : "heading",
                )
              }
            >
              {activeHeading.label}
              <ChevronDown className="size-4 text-muted-foreground" />
            </button>
            {activePopover === "heading" && (
              <div className="te-popover absolute left-0 top-full z-30 mt-1 w-40 rounded-md p-1 shadow-lg">
                {headingOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="menuitem"
                    className="flex w-full rounded px-2.5 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => selectHeading(option.level)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Divider />

          <IconButton
            icon={Bold}
            label="Bold"
            active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
          />
          <IconButton
            icon={Italic}
            label="Italic"
            active={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          />
          <IconButton
            icon={Underline}
            label="Underline"
            active={editor.isActive("underline")}
            onClick={() => editor.chain().focus().toggleMark("underline").run()}
          />
          <IconButton
            icon={Code}
            label="Inline code"
            active={editor.isActive("code")}
            onClick={() => editor.chain().focus().toggleCode().run()}
          />
          <IconButton
            icon={LinkIcon}
            label="Insert link"
            active={editor.isActive("link")}
            onClick={() =>
              setActivePopover((current) => (current === "link" ? null : "link"))
            }
          />
          <Divider />

          <IconButton
            icon={ListIcon}
            label="Bullet list"
            active={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          />
          <IconButton
            icon={ListOrdered}
            label="Numbered list"
            active={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          />
          <IconButton
            icon={Quote}
            label="Blockquote"
            active={editor.isActive("blockquote")}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          />
          <Divider />

          <div
            ref={activePopover === "insert" ? popoverRef : undefined}
            className="relative"
          >
            <button
              type="button"
              className="flex h-8 items-center gap-1.5 rounded border border-primary px-2.5 text-sm font-semibold text-primary hover:bg-[var(--primary-soft)]"
              aria-haspopup="menu"
              aria-expanded={activePopover === "insert"}
              onClick={() =>
                setActivePopover((current) => (current === "insert" ? null : "insert"))
              }
            >
              <Plus className="size-4" />
              Insert
            </button>
            {activePopover === "insert" && (
              <div className="te-popover absolute right-0 top-full z-30 mt-1 w-52 rounded-md p-1 shadow-lg">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-sm hover:bg-muted"
                  onClick={() => {
                    editor.chain().focus().setHorizontalRule().run();
                    setActivePopover(null);
                  }}
                >
                  <Minus className="size-4" />
                  Horizontal rule
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-sm hover:bg-muted"
                  onClick={() => {
                    editor.chain().focus().toggleCodeBlock().run();
                    setActivePopover(null);
                  }}
                >
                  <Code className="size-4" />
                  Code block
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-sm hover:bg-muted disabled:opacity-50"
                  onClick={insertTable}
                  disabled={
                    !editor
                      .can()
                      .chain()
                      .focus()
                      .insertTable({
                        rows: 3,
                        cols: 3,
                        withHeaderRow: true,
                      })
                      .run()
                  }
                >
                  <TableIcon className="size-4" />
                  Table
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-sm hover:bg-muted disabled:opacity-50"
                  disabled={isUploadingImage}
                  onClick={() => {
                    onRequestImageUpload();
                    setActivePopover(null);
                  }}
                >
                  <ImageIcon className="size-4" />
                  {isUploadingImage ? "Uploading image…" : "Image"}
                </button>

                {editor.isActive("table") && (
                  <>
                    <div className="my-1 h-px bg-border" />
                    <button
                      type="button"
                      className="flex w-full rounded px-2.5 py-2 text-sm hover:bg-muted"
                      onClick={() => {
                        editor.chain().focus().addRowAfter().run();
                        setActivePopover(null);
                      }}
                    >
                      Add table row
                    </button>
                    <button
                      type="button"
                      className="flex w-full rounded px-2.5 py-2 text-sm hover:bg-muted"
                      onClick={() => {
                        editor.chain().focus().addColumnAfter().run();
                        setActivePopover(null);
                      }}
                    >
                      Add table column
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-sm text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        editor.chain().focus().deleteTable().run();
                        setActivePopover(null);
                      }}
                    >
                      <Trash2 className="size-4" />
                      Remove table
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <span className="ml-auto hidden pl-8 text-xs tabular-nums text-muted-foreground xl:inline">
            {wordCount.toLocaleString()} {wordCount === 1 ? "word" : "words"}
            <span aria-hidden className="mx-2">
              ·
            </span>
            {readTime} min
          </span>
        </div>
      </div>

      {activePopover === "link" && (
        <LinkEditorPopover
          editor={editor}
          onClose={() => setActivePopover(null)}
          containerRef={popoverRef}
        />
      )}
    </div>
  );
};

export default Toolbar;
