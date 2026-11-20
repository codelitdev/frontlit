import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection, Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
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
 * Moves the top-level block at `from` to the top-level gap at `to` (a
 * position between blocks). Returns null when the move changes nothing.
 */
export function moveBlock(state: EditorState, from: number, to: number) {
  const node = state.doc.nodeAt(from);
  if (!node || (to >= from && to <= from + node.nodeSize)) return null;
  const tr = state.tr.delete(from, from + node.nodeSize);
  const at = tr.mapping.map(to);
  tr.insert(at, node);
  tr.setSelection(NodeSelection.create(tr.doc, at));
  return tr.scrollIntoView();
}

/** The gap between top-level blocks closest to a pointer height, and its y. */
function dropGap(view: EditorView, y: number): { pos: number; y: number } {
  let result: { pos: number; y: number } | null = null;
  let lastBottom = 0;
  view.state.doc.forEach((_node: ProseMirrorNode, offset: number) => {
    if (result) return;
    const dom = view.nodeDOM(offset);
    if (!(dom instanceof HTMLElement)) return;
    const box = dom.getBoundingClientRect();
    if (y < box.top + box.height / 2) result = { pos: offset, y: box.top };
    lastBottom = box.bottom;
  });
  return result ?? { pos: view.state.doc.content.size, y: lastBottom };
}

/**
 * A handle beside the hovered top-level block. Press it and move the pointer:
 * a line shows where the block will land; releasing moves it in one
 * transaction, so undo puts it back. (Pointer events rather than HTML5
 * drag and drop, which behaves differently across browsers.)
 */
export const DragHandle = Extension.create({
  name: "dragHandle",
  addProseMirrorPlugins() {
    let handle: HTMLElement | null = null;
    let current: number | null = null;
    let dragging = false;
    const hide = () => {
      if (dragging) return;
      if (handle) handle.style.display = "none";
      current = null;
    };
    return [
      new Plugin({
        key: dragHandleKey,
        view(view) {
          const host = view.dom.parentElement;
          if (host && getComputedStyle(host).position === "static")
            host.style.position = "relative";
          handle = document.createElement("div");
          handle.className = "te-drag-handle";
          handle.title = "Drag to move";
          handle.setAttribute("role", "button");
          handle.setAttribute("aria-label", "Drag to move block");
          handle.setAttribute("data-drag-handle", "");
          handle.textContent = "⠿";
          handle.style.display = "none";
          const line = document.createElement("div");
          line.className = "te-drop-indicator";
          line.style.display = "none";
          host?.appendChild(handle);
          host?.appendChild(line);
          handle.addEventListener("mousedown", (event) => {
            if (event.button !== 0 || current === null || !host || !view.editable)
              return;
            event.preventDefault();
            const from = current;
            dragging = true;
            document.body.classList.add("te-dragging");
            const onMove = (move: MouseEvent) => {
              const gap = dropGap(view, move.clientY);
              const box = host.getBoundingClientRect();
              const content = view.dom.getBoundingClientRect();
              line.style.display = "block";
              line.style.top = `${gap.y - box.top + host.scrollTop - 1}px`;
              line.style.left = `${content.left - box.left}px`;
              line.style.width = `${content.width}px`;
            };
            const onUp = (up: MouseEvent) => {
              window.removeEventListener("mousemove", onMove);
              window.removeEventListener("mouseup", onUp);
              document.body.classList.remove("te-dragging");
              line.style.display = "none";
              dragging = false;
              hide();
              const tr = moveBlock(view.state, from, dropGap(view, up.clientY).pos);
              if (tr) view.dispatch(tr);
              view.focus();
            };
            window.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onUp);
          });
          return {
            destroy() {
              handle?.remove();
              line.remove();
              handle = null;
            },
          };
        },
        props: {
          handleDOMEvents: {
            mousemove(view, event) {
              if (!view.editable || !handle || dragging) return false;
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
