import React, { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import type { Level } from "@tiptap/extension-heading";
import {
  Bold,
  ChevronDown,
  Code,
  Italic,
  Link as LinkIcon,
  List as ListIcon,
  ListOrdered,
  Plus,
  Quote,
  Redo2,
  Underline,
  Undo2,
} from "lucide-react";
import LinkEditorPopover from "./components/link-editor-popover.js";
import type { Profile } from "./core/types";
import type { InsertItem } from "./ui/insert-items";
import { useTextEditorLabels } from "./labels-context";

interface ToolbarProps {
  profile: Profile;
  editor: Editor | null;
  /** Entries of the Insert menu (the same as the `/` menu). */
  items: InsertItem[];
  isUploadingImage?: boolean;
}

/** Shown as their own toolbar buttons, so not repeated in the Insert menu. */
const BUTTON_ITEMS = [
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "blockquote",
];

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

function Divider(): React.JSX.Element {
  return <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-border" />;
}

const Toolbar = ({
  editor,
  items,
  isUploadingImage,
  profile,
}: ToolbarProps): React.JSX.Element | null => {
  const labels = useTextEditorLabels();
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

  const hasNode = (name: string) => profile.nodeNames.has(name);
  const hasMark = (name: string) => profile.marks.includes(name as never);
  // The default editor has always offered headings 1–3.
  const levels = profile.headingLevels.filter(
    (level) => profile.options.name !== "default" || level <= 3,
  );
  const paragraphOption: { label: string; value: string; level?: Level } = {
    label: labels.paragraph,
    value: "paragraph",
  };
  const availableHeadingOptions = [
    paragraphOption,
    ...(hasNode("heading")
      ? levels.map((level) => ({
          label: labels.heading(level),
          value: `h${level}`,
          level: level as Level,
        }))
      : []),
  ];
  const insertItems = items.filter((item) => !BUTTON_ITEMS.includes(item.name));
  const activeHeading =
    availableHeadingOptions.find((option) =>
      option.level
        ? editor.isActive("heading", { level: option.level })
        : editor.isActive("paragraph"),
    ) ?? paragraphOption;
  const readTime = wordCount === 0 ? 0 : Math.max(1, Math.ceil(wordCount / 200));

  const selectHeading = (level?: Level) => {
    const chain = editor.chain().focus();
    if (level) chain.setHeading({ level }).run();
    else chain.setParagraph().run();
    setActivePopover(null);
  };

  return (
    <div className="relative w-full">
      <div className="overflow-visible border-b border-border bg-card">
        <div className="flex min-h-11 flex-wrap items-center gap-1 px-4 py-1">
          <IconButton
            icon={Undo2}
            label={labels.undo}
            disabled={!editor.can().undo()}
            onClick={() => editor.chain().focus().undo().run()}
          />
          <IconButton
            icon={Redo2}
            label={labels.redo}
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
                {availableHeadingOptions.map((option) => (
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

          {hasMark("bold") && (
            <IconButton
              icon={Bold}
              label={labels.bold}
              active={editor.isActive("bold")}
              onClick={() => editor.chain().focus().toggleBold().run()}
            />
          )}
          {hasMark("italic") && (
            <IconButton
              icon={Italic}
              label={labels.italic}
              active={editor.isActive("italic")}
              onClick={() => editor.chain().focus().toggleItalic().run()}
            />
          )}
          {hasMark("underline") && (
            <IconButton
              icon={Underline}
              label={labels.underline}
              active={editor.isActive("underline")}
              onClick={() => editor.chain().focus().toggleMark("underline").run()}
            />
          )}
          {hasMark("code") && (
            <IconButton
              icon={Code}
              label={labels.inlineCode}
              active={editor.isActive("code")}
              onClick={() => editor.chain().focus().toggleCode().run()}
            />
          )}
          {hasMark("link") && (
            <IconButton
              icon={LinkIcon}
              label={labels.insertLink}
              active={editor.isActive("link")}
              onClick={() =>
                setActivePopover((current) => (current === "link" ? null : "link"))
              }
            />
          )}
          <Divider />

          {hasNode("bulletList") && (
            <IconButton
              icon={ListIcon}
              label={labels.bulletList}
              active={editor.isActive("bulletList")}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            />
          )}
          {hasNode("orderedList") && (
            <IconButton
              icon={ListOrdered}
              label={labels.numberedList}
              active={editor.isActive("orderedList")}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
            />
          )}
          {hasNode("blockquote") && (
            <IconButton
              icon={Quote}
              label={labels.blockquote}
              active={editor.isActive("blockquote")}
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
            />
          )}
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
              {labels.insert}
            </button>
            {activePopover === "insert" && (
              <div className="te-popover absolute right-0 top-full z-30 mt-1 w-52 rounded-md p-1 shadow-lg">
                {insertItems.map((item) => {
                  const Icon = item.icon;
                  const busy = item.name === "image" && isUploadingImage;
                  return (
                    <button
                      key={`${item.name}-${item.label}`}
                      type="button"
                      className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={Boolean(item.unavailable) || busy}
                      title={item.unavailable}
                      onClick={() => {
                        item.run(editor);
                        setActivePopover(null);
                      }}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span className="flex min-w-0 flex-col">
                        <span>{busy ? labels.uploadingImage : item.label}</span>
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
            )}
          </div>

          <span className="ml-auto hidden pl-8 text-xs tabular-nums text-muted-foreground xl:inline">
            {labels.wordCount(wordCount)}
            <span aria-hidden className="mx-2">
              ·
            </span>
            {labels.readTime(readTime)}
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
