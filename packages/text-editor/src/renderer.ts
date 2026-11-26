/**
 * Server-component entry for rendering saved rich text. Unlike the root entry
 * it carries no editor; the code-block copy button, tabs and embed frame are
 * its only client parts.
 */
export { TextRenderer, type TextRendererProps } from "./text-renderer";
export { ContentRenderer, type ContentRendererProps } from "./ui/renderer";
export {
  defaultTextEditorLabels,
  resolveTextEditorLabels,
  type TextEditorLabels,
} from "./labels";
export type {
  BlockRenderer,
  BlockRendererProps,
  ResolveMedia,
  ResolvedMedia,
} from "./ui/types";
