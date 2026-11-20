import type { JSONContent } from "@tiptap/core";
import { validateContent } from "../core/validate";
import { asDocsError, DocsContentError, type DocsDiagnostic } from "./diagnostics";
import { docsProfile } from "./profile";

export { DOCS_LIMITS } from "./profile";

/** Checks before ProseMirror can discard unknown keys. Never repairs supplied invalid trees. */
export function validateDocsContent(input: unknown): {
  content?: JSONContent;
  diagnostics: DocsDiagnostic[];
} {
  return validateContent(docsProfile, input);
}

export function requireDocsContent(input: unknown): JSONContent {
  const result = validateDocsContent(input);
  if (!result.content) throw new DocsContentError(result.diagnostics);
  return result.content;
}
export { asDocsError };
