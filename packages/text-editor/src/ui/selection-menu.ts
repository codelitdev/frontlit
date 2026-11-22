import type { Editor } from "@tiptap/core";
import type { BubbleMenuPluginProps } from "@tiptap/extension-bubble-menu";
import { TextSelection } from "@tiptap/pm/state";

/** The bubble menu's plugin key (see `bubble-menu.tsx`). */
export const SELECTION_MENU_KEY = "inlineBubbleMenu";

/** Editors whose menu Escape closed; it stays closed until the selection changes. */
const dismissed = new WeakSet<Editor>();

/** The plugin's own rule (text selected, editor or menu focused), unless dismissed. */
export const shouldShowSelectionMenu: NonNullable<
  BubbleMenuPluginProps["shouldShow"]
> = ({ editor, element, view, state, from, to }) => {
  if (dismissed.has(editor)) return false;
  const { selection } = state;
  const emptyText =
    !state.doc.textBetween(from, to).length && selection instanceof TextSelection;
  const focused = view.hasFocus() || element.contains(document.activeElement);
  return focused && !selection.empty && !emptyText && editor.isEditable;
};

/** Lets the menu show again (on a selection change). */
export function resetSelectionMenu(editor: Editor) {
  dismissed.delete(editor);
}

/** Closes the menu until the selection changes. */
export function dismissSelectionMenu(editor: Editor) {
  dismissed.add(editor);
  editor.view.dispatch(editor.state.tr.setMeta(SELECTION_MENU_KEY, "hide"));
}

/** The selection menu while it is shown; the plugin detaches it when hidden. */
function shownMenu(editor: Editor): HTMLElement | null {
  const parent = editor.view.dom.parentElement;
  if (!parent) return null;
  const menu = Array.from(parent.children).find((child) =>
    child.classList.contains("bubble-menu"),
  );
  return menu instanceof HTMLElement && menu.style.visibility === "visible"
    ? menu
    : null;
}

/** Text is selected, so the menu shows or is about to (it waits for the selection to settle). */
function hasSelectedText(editor: Editor): boolean {
  const { selection, doc } = editor.state;
  return !selection.empty && doc.textBetween(selection.from, selection.to).length > 0;
}

/**
 * Escape in the text: closes the selection menu until the selection changes.
 * Handles the key only when the menu was showing, so Escape still reaches the
 * host otherwise.
 */
export function hideSelectionMenu(editor: Editor): boolean {
  if (!hasSelectedText(editor) || dismissed.has(editor)) return false;
  const shown = Boolean(shownMenu(editor));
  dismissSelectionMenu(editor);
  return shown;
}

/** Alt-F10 with text selected: shows the selection menu now and focuses its first button. */
export function focusSelectionMenu(editor: Editor): boolean {
  if (!hasSelectedText(editor)) return false;
  if (!shownMenu(editor)) {
    resetSelectionMenu(editor);
    editor.view.dispatch(editor.state.tr.setMeta(SELECTION_MENU_KEY, "show"));
  }
  const button = shownMenu(editor)?.querySelector<HTMLElement>("button");
  if (!button) return false;
  button.focus();
  return true;
}
