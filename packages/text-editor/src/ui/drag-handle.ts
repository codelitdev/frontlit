import { Extension } from "@tiptap/core";
import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

export const dragHandleKey = new PluginKey("dragHandle");

/** Position of the top-level block under the pointer, if any. */
export function topLevelBlockAt(view: EditorView, x: number, y: number): number | null {
  const coords = view.posAtCoords({ left: x, top: y });
  if (!coords) return null;
  const $pos = view.state.doc.resolve(coords.pos);
  if ($pos.depth > 0) return $pos.before(1);
  if (coords.inside >= 0) {
    const $inside = view.state.doc.resolve(coords.inside);
    return $inside.depth > 0 ? $inside.before(1) : coords.inside;
  }
  return null;
}

/**
 * A handle beside the hovered top-level block. Dragging it moves the block
 * (ProseMirror's own drop handling does the move, so undo works).
 */
export const DragHandle = Extension.create({
  name: "dragHandle",
  addProseMirrorPlugins() {
    let handle: HTMLElement | null = null;
    let current: number | null = null;
    const hide = () => {
      if (handle) handle.style.display = "none";
      current = null;
    };
    return [
      new Plugin({
        key: dragHandleKey,
        view(view) {
          const host = view.dom.parentElement;
          handle = document.createElement("div");
          handle.className = "te-drag-handle";
          handle.draggable = true;
          handle.title = "Drag to move";
          handle.setAttribute("role", "button");
          handle.setAttribute("aria-label", "Drag to move block");
          handle.setAttribute("data-drag-handle", "");
          handle.textContent = "⠿";
          handle.style.display = "none";
          if (host && getComputedStyle(host).position === "static")
            host.style.position = "relative";
          host?.appendChild(handle);
          handle.addEventListener("dragstart", (event) => {
            if (current === null || !event.dataTransfer) return;
            const selection = NodeSelection.create(view.state.doc, current);
            view.dispatch(view.state.tr.setSelection(selection));
            const slice = selection.content();
            const { dom, text } = view.serializeForClipboard(slice);
            event.dataTransfer.clearData();
            event.dataTransfer.setData("text/html", dom.innerHTML);
            event.dataTransfer.setData("text/plain", text);
            event.dataTransfer.effectAllowed = "copyMove";
            const node = view.nodeDOM(current);
            if (node instanceof HTMLElement)
              event.dataTransfer.setDragImage(node, 0, 0);
            view.dragging = {
              slice,
              move: true,
              node: selection,
            } as typeof view.dragging;
          });
          handle.addEventListener("dragend", hide);
          return {
            destroy() {
              handle?.remove();
              handle = null;
            },
          };
        },
        props: {
          handleDOMEvents: {
            mousemove(view, event) {
              if (!view.editable || !handle || view.dragging) return false;
              const host = view.dom.parentElement;
              const rect = view.dom.getBoundingClientRect();
              const pos = topLevelBlockAt(view, rect.left + 24, event.clientY);
              const node = pos === null ? null : view.nodeDOM(pos);
              if (pos === null || !(node instanceof HTMLElement) || !host) {
                hide();
                return false;
              }
              current = pos;
              const box = node.getBoundingClientRect();
              const hostBox = host.getBoundingClientRect();
              handle.style.display = "flex";
              handle.style.top = `${box.top - hostBox.top + host.scrollTop}px`;
              handle.style.left = `${box.left - hostBox.left - 22}px`;
              return false;
            },
            keydown() {
              hide();
              return false;
            },
          },
        },
      }),
    ];
  },
});
