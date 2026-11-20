"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import type { JSONContent } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  type ReactNodeViewProps,
} from "@tiptap/react";
import { Fragment } from "@tiptap/pm/model";
import { Plus, Settings2, Trash2, X } from "lucide-react";
import type { BlockUi, ResolveMedia } from "./types";
import type { PickMedia } from "./media-picker";

export const inputClass =
  "h-7 min-w-0 rounded border border-input bg-card px-2 text-xs text-foreground placeholder:text-muted-foreground";
export const smallButton =
  "inline-flex h-7 items-center gap-1 rounded px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40";

export const paragraph = (text = ""): JSONContent =>
  text
    ? { type: "paragraph", content: [{ type: "text", text }] }
    : { type: "paragraph" };

/** Editor-wide context for node views: block UIs, media picker and preview lookup. */
export interface EditorBlocksContextValue {
  ui: ReadonlyMap<string, BlockUi>;
  pickMedia: PickMedia | null;
  resolveMedia?: ResolveMedia;
  /** Previews of media picked in this session, by ID. */
  previews: Map<string, { url?: string; name?: string }>;
}
export const EditorBlocksContext = createContext<EditorBlocksContextValue>({
  ui: new Map(),
  pickMedia: null,
  previews: new Map(),
});
export const useEditorBlocks = () => useContext(EditorBlocksContext);

/** The block's settings component in a popover, opened from its bar. */
function SettingsButton({
  props,
  label,
}: {
  props: ReactNodeViewProps;
  label: string;
}) {
  const { ui } = useEditorBlocks();
  const Settings = ui.get(props.node.type.name)?.settings;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  if (!Settings || !props.editor.isEditable) return null;
  return (
    <span ref={ref} className="relative">
      <button
        type="button"
        className={smallButton}
        aria-label={`${label} settings`}
        title={`${label} settings`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Settings2 className="size-3.5" />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={`${label} settings`}
          className="te-popover te-block-settings absolute right-0 top-full z-30 mt-1 w-72 rounded-md p-3 shadow-lg"
        >
          <Settings
            attrs={props.node.attrs}
            update={(attrs) => props.updateAttributes(attrs)}
            editor={props.editor}
            node={props.node}
          />
        </div>
      )}
    </span>
  );
}

/** A top-level block: label, inline fields, add-child, settings and remove buttons. */
export function BlockFrame({
  label,
  props,
  children,
  fields,
}: {
  label: string;
  props: ReactNodeViewProps;
  children?: React.ReactNode;
  fields?: React.ReactNode;
}) {
  const { node, editor, getPos, deleteNode } = props;
  const { ui } = useEditorBlocks();
  const add = ui.get(node.type.name)?.addChild;
  return (
    <NodeViewWrapper className="te-block" data-block={node.type.name}>
      <div className="te-block__bar" contentEditable={false}>
        <span className="te-block__label">{label}</span>
        {fields}
        <span className="ml-auto flex items-center gap-1">
          {add && editor.isEditable && (
            <button
              type="button"
              className={smallButton}
              onClick={() => {
                // Read the container from the current state: the view's `node`
                // can predate edits inside it, and a stale size would put the
                // child inside the last item, where insertContentAt re-fits
                // (wraps) the surrounding content instead of failing.
                const pos = getPos();
                const current =
                  typeof pos === "number" ? editor.state.doc.nodeAt(pos) : null;
                if (typeof pos !== "number" || current?.type !== node.type) return;
                const child = editor.schema.nodeFromJSON(
                  add.create(current.childCount),
                );
                const end = current.childCount;
                if (!current.canReplace(end, end, Fragment.from(child))) return;
                const at = pos + current.nodeSize - 1;
                editor.view.dispatch(
                  editor.state.tr.insert(at, child).scrollIntoView(),
                );
                editor.view.focus();
              }}
            >
              <Plus className="size-3.5" />
              {add.label}
            </button>
          )}
          <SettingsButton props={props} label={label} />
          {editor.isEditable && (
            <button
              type="button"
              className={smallButton}
              aria-label={`Remove ${label.toLowerCase()}`}
              title={`Remove ${label.toLowerCase()}`}
              onClick={deleteNode}
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </span>
      </div>
      {children ??
        (node.isAtom ? null : <NodeViewContent className="te-block__content" />)}
    </NodeViewWrapper>
  );
}

/** A tab, step, card or accordion item: optional fields, removable unless it is the last one. */
export function ItemFrame({
  props,
  fields,
}: {
  props: ReactNodeViewProps;
  fields?: React.ReactNode;
}) {
  const { editor, getPos, deleteNode, node } = props;
  const pos = getPos();
  const parent = typeof pos === "number" ? editor.state.doc.resolve(pos).parent : null;
  return (
    <NodeViewWrapper className="te-block-item" data-block={node.type.name}>
      {(fields || (parent?.childCount ?? 0) > 1) && (
        <div className="te-block__bar" contentEditable={false}>
          {fields}
          {(parent?.childCount ?? 0) > 1 && editor.isEditable && (
            <button
              type="button"
              className={`${smallButton} ml-auto`}
              aria-label="Remove item"
              title="Remove item"
              onClick={deleteNode}
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      )}
      <NodeViewContent className="te-block__content" />
    </NodeViewWrapper>
  );
}

export function TextField({
  props,
  name,
  placeholder,
  nullable,
  className = "w-40",
}: {
  props: ReactNodeViewProps;
  name: string;
  placeholder: string;
  nullable?: boolean;
  className?: string;
}) {
  const value = (props.node.attrs[name] as string | null) ?? "";
  return (
    <input
      className={`${inputClass} ${className}`}
      aria-label={placeholder}
      placeholder={placeholder}
      value={value}
      disabled={!props.editor.isEditable}
      onChange={(event) =>
        props.updateAttributes({
          [name]: nullable && !event.target.value ? null : event.target.value,
        })
      }
    />
  );
}

/** A labelled field for settings popovers. */
export function SettingsField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="mb-2 flex flex-col gap-1 text-xs font-medium text-foreground last:mb-0">
      {label}
      {children}
    </label>
  );
}
