"use client";

import { createContext, useContext } from "react";
import { defaultTextEditorLabels, type TextEditorLabels } from "./labels";

/**
 * The editor's resolved labels, set by `Editor` for its toolbar, menus, node
 * views and the `/` menu (rendered through the editor's portals).
 */
export const TextEditorLabelsContext = createContext<TextEditorLabels>(
  defaultTextEditorLabels,
);

export const useTextEditorLabels = () => useContext(TextEditorLabelsContext);
