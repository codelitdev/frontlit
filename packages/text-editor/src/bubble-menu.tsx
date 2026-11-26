import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import type { BubbleMenuPluginProps } from "@tiptap/extension-bubble-menu";
import { BubbleMenuPlugin } from "@tiptap/extension-bubble-menu";
import {
  Bold,
  Code,
  Italic,
  Link as LinkIcon,
  Strikethrough,
  Underline,
} from "lucide-react";
import LinkEditorPopover from "./components/link-editor-popover";
import type { Profile } from "./core/types";
import { useTextEditorLabels } from "./labels-context";
import {
  dismissSelectionMenu,
  resetSelectionMenu,
  SELECTION_MENU_KEY,
  shouldShowSelectionMenu,
} from "./ui/selection-menu";

interface BubbleMenuProps {
  editor: Editor;
  profile: Profile;
}

const buttonBase =
  "inline-flex h-8 w-8 items-center justify-center rounded text-foreground transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

type TipTapBubbleMenuProps = {
  editor: Editor | null;
  className?: string;
  children: React.ReactNode;
  pluginKey?: string;
} & Partial<Omit<BubbleMenuPluginProps, "editor" | "element" | "pluginKey">>;

const TipTapBubbleMenu = ({
  editor,
  className,
  children,
  pluginKey = SELECTION_MENU_KEY,
  updateDelay,
  resizeDelay,
  shouldShow,
  appendTo,
  getReferencedVirtualElement,
  options,
}: TipTapBubbleMenuProps): React.JSX.Element => {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = menuRef.current;

    if (!editor || editor.isDestroyed || !element) {
      return;
    }

    const plugin = BubbleMenuPlugin({
      editor,
      element,
      pluginKey,
      updateDelay,
      resizeDelay,
      shouldShow: shouldShow ?? null,
      appendTo,
      getReferencedVirtualElement,
      options,
    });

    editor.registerPlugin(plugin);

    return () => {
      editor.unregisterPlugin(pluginKey);
    };
  }, [
    editor,
    pluginKey,
    updateDelay,
    resizeDelay,
    shouldShow,
    appendTo,
    getReferencedVirtualElement,
    options,
  ]);

  return (
    <div ref={menuRef} className={className} style={{ visibility: "hidden" }}>
      {children}
    </div>
  );
};

function InlineButton({
  icon: Icon,
  label,
  active,
  toggle = true,
  onClick,
  buttonRef,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  /** A mark on or off (`aria-pressed`); false for buttons that open something. */
  toggle?: boolean;
  onClick: () => void;
  buttonRef?: React.Ref<HTMLButtonElement>;
}): React.JSX.Element {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={toggle ? Boolean(active) : undefined}
      className={`${buttonBase} ${
        active
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : "bg-transparent hover:bg-muted"
      }`}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

const InlineBubbleMenu = ({
  editor,
  profile,
}: BubbleMenuProps): React.JSX.Element | null => {
  const labels = useTextEditorLabels();
  const [isLinkEditing, setIsLinkEditing] = useState(false);
  const linkButton = useRef<HTMLButtonElement | null>(null);

  // A toolbar: ←/→/Home/End move between buttons; Escape returns to the
  // text with the selection kept and hides the menu until it changes.
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) return; // the link field handled it
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setIsLinkEditing(false);
      editor.view.focus();
      dismissSelectionMenu(editor);
      return;
    }
    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>("[role=toolbar] button"),
    );
    const at = buttons.indexOf(document.activeElement as HTMLElement);
    if (at === -1) return;
    const to =
      event.key === "ArrowRight"
        ? (at + 1) % buttons.length
        : event.key === "ArrowLeft"
          ? (at - 1 + buttons.length) % buttons.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? buttons.length - 1
              : null;
    if (to === null) return;
    event.preventDefault();
    buttons[to]?.focus();
  };

  const openLinkEditor = useCallback(() => {
    setIsLinkEditing((prev) => !prev);
  }, []);

  useEffect(() => {
    const handleSelectionUpdate = () => {
      setIsLinkEditing(false);
      resetSelectionMenu(editor);
    };

    editor.on("selectionUpdate", handleSelectionUpdate);

    return () => {
      editor.off("selectionUpdate", handleSelectionUpdate);
    };
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    <TipTapBubbleMenu
      editor={editor}
      shouldShow={shouldShowSelectionMenu}
      className="bubble-menu flex flex-col gap-1 rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-xl"
    >
      <div onKeyDown={onKeyDown}>
        <div
          role="toolbar"
          aria-label={labels.textFormatting}
          className="flex items-center gap-1"
        >
          {profile.marks.includes("bold") && (
            <InlineButton
              icon={Bold}
              label={labels.bold}
              active={editor.isActive("bold")}
              onClick={() => editor.chain().focus().toggleBold().run()}
            />
          )}
          {profile.marks.includes("italic") && (
            <InlineButton
              icon={Italic}
              label={labels.italic}
              active={editor.isActive("italic")}
              onClick={() => editor.chain().focus().toggleItalic().run()}
            />
          )}
          {profile.marks.includes("underline") && (
            <InlineButton
              icon={Underline}
              label={labels.underline}
              active={editor.isActive("underline")}
              onClick={() => editor.chain().focus().toggleMark("underline").run()}
            />
          )}
          {profile.marks.includes("strike") && (
            <InlineButton
              icon={Strikethrough}
              label={labels.strikethrough}
              active={editor.isActive("strike")}
              onClick={() => editor.chain().focus().toggleStrike().run()}
            />
          )}
          {profile.marks.includes("code") && (
            <InlineButton
              icon={Code}
              label={labels.inlineCode}
              active={editor.isActive("code")}
              onClick={() => editor.chain().focus().toggleCode().run()}
            />
          )}
          {profile.marks.includes("link") && (
            <InlineButton
              icon={LinkIcon}
              label={editor.isActive("link") ? labels.editLink : labels.insertLink}
              active={editor.isActive("link")}
              toggle={false}
              onClick={openLinkEditor}
              buttonRef={linkButton}
            />
          )}
        </div>
        {isLinkEditing && (
          <LinkEditorPopover
            editor={editor}
            onClose={() => {
              setIsLinkEditing(false);
              linkButton.current?.focus();
            }}
            variant="inline"
          />
        )}
      </div>
    </TipTapBubbleMenu>
  );
};

export default InlineBubbleMenu;
