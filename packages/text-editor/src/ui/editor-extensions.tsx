"use client";

import React from "react";
import { Node as TiptapNode, type Extensions } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { createProfileExtensions } from "../core/extensions";
import type { Profile } from "../core/types";
import { BlockFrame } from "./block-frame";
import { BlockKeyboard, DragHandle } from "./drag-handle";
import type { InsertItem } from "./insert-items";
import { CodeBlockFieldsView, libraryUi } from "./library-ui";
import { createSlashCommand } from "./slash-command";
import type { BlockUi, NodeViewComponent } from "./types";

/**
 * Block UIs for a profile: the library's for library blocks, then UIs given
 * to `defineProfile`, then `extra` (later entries win).
 */
export function collectBlockUi(
  profile: Profile,
  extra: BlockUi[] = [],
): Map<string, BlockUi> {
  const ui = new Map<string, BlockUi>();
  for (const schema of profile.blockSchemas.values()) {
    const library = libraryUi(schema);
    if (library) ui.set(schema.name, library);
  }
  for (const [name, value] of profile.ui) ui.set(name, value as BlockUi);
  for (const block of extra)
    if (profile.blockSchemas.has(block.schema.name)) ui.set(block.schema.name, block);
  return ui;
}

export interface EditorExtensionOptions {
  placeholder?: string;
  ui: ReadonlyMap<string, BlockUi>;
  /** Current insert entries for the `/` menu (read on every keystroke). */
  getItems(): InsertItem[];
}

/** Browser editor extensions: the profile's, with node views, the `/` menu and drag handles. */
export function createEditorExtensions(
  profile: Profile,
  { placeholder, ui, getItems }: EditorExtensionOptions,
): Extensions {
  const views = new Map<string, NodeViewComponent>();
  for (const [name, block] of ui) {
    if (block.view) views.set(name, block.view);
    else if (block.settings) {
      const label = block.insert.label;
      views.set(name, (props) => <BlockFrame label={label} props={props} />);
    }
  }
  if (profile.options.codeBlockFields) views.set("codeBlock", CodeBlockFieldsView);
  return [
    ...createProfileExtensions(profile, { editing: true, placeholder }).map(
      (extension) => {
        const view = views.get(extension.name);
        if (!view || !(extension instanceof TiptapNode)) return extension;
        return extension.extend({
          addNodeView() {
            return ReactNodeViewRenderer(view);
          },
        });
      },
    ),
    createSlashCommand(getItems),
    DragHandle,
    BlockKeyboard,
  ];
}
