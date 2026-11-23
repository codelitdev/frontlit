/**
 * `@frontlit/text-editor/blocks` — server-safe block definitions and profiles.
 * No React, no browser globals. Never imports from `src/docs/`.
 */
export * from "./diagnostics";
export * from "./types";
export { defineProfile, isProfile, codeFor } from "./profile";
export {
  createProfileExtensions,
  getProfileSchema,
  createBlockNode,
  CodeBlockTitle,
  InlineCode,
  type ProfileExtensionOptions,
} from "./extensions";
export {
  parseMarkdown,
  serializeMarkdown,
  type ParseMarkdownOptions,
} from "./markdown";
export {
  validateContent,
  incompleteBlocks,
  requireContent,
  type ValidateOptions,
  type ValidationResult,
} from "./validate";
export { checkUrlAttr } from "./url-check";
export * from "./reference";
export * from "./urls";
export { evaluateLiteral, writeLiteral, quote } from "./literal";
export * from "./library";
export * from "./headings";
