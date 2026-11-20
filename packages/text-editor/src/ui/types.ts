import type React from "react";
import type { Editor, JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { ReactNodeViewProps } from "@tiptap/react";
import type { BlockSchema } from "../core/types";

export type Icon = React.ComponentType<{ className?: string }>;

export interface BlockSettingsProps<Attrs = Record<string, any>> {
  attrs: Attrs;
  /** Merges attributes into the block. */
  update(attrs: Partial<Attrs>): void;
  editor: Editor;
  node: ProseMirrorNode;
}

/** A node view component (Tiptap React node view props). */
export type NodeViewComponent = React.ComponentType<ReactNodeViewProps>;
export type SettingsComponent<Attrs = Record<string, any>> = React.ComponentType<
  BlockSettingsProps<Attrs>
>;

/**
 * Browser half of a block: the `/` menu entry, an optional node view and an
 * optional settings component shown in the block's settings popover.
 */
export interface BlockUi<Attrs = Record<string, any>> {
  schema: BlockSchema<Attrs>;
  insert: {
    label: string;
    icon: Icon;
    keywords: string[];
    /** Content inserted at the cursor. */
    create(): JSONContent;
    description?: string;
  };
  view?: NodeViewComponent;
  settings?: SettingsComponent<Attrs>;
  /** For containers: the "Add …" button that appends a child item. */
  addChild?: { label: string; create(count: number): JSONContent };
}

/** What `resolveMedia(id)` returns: a URL, or a URL with a file name and type. */
export type ResolvedMedia = string | { url: string; name?: string; mimeType?: string };
/** Host lookup from a media ID to its URL. Synchronous: the renderer is static. */
export type ResolveMedia = (id: string) => ResolvedMedia | null | undefined;

export interface BlockRendererProps {
  node: ProseMirrorNode;
  attrs: Record<string, any>;
  children?: React.ReactNode;
  resolveMedia?: ResolveMedia;
}
/** Host component that renders a block (e.g. a learner quiz with state). */
export type BlockRenderer = React.ComponentType<BlockRendererProps>;

export function mediaUrl(resolve: ResolveMedia | undefined, id: unknown) {
  if (typeof id !== "string" || !resolve) return null;
  const value = resolve(id);
  if (!value) return null;
  return typeof value === "string" ? { url: value } : value;
}
