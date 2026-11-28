import { applyTextEdits, type TextEdit } from "@frontlit/text-editor/blocks";
import { parsePageFile, serializePageFile, type PageDocument } from "./files";

/**
 * Applies exact-match `edits` to a page through its canonical page file text
 * (`serializePageFile`, the same JSON Git-connected repositories hold, with
 * rich text as Markdown): serialize → `applyTextEdits` → `parsePageFile`.
 * Throws `TextEditError` for an edit that doesn't apply and
 * `SchemaValidationError` when the edited file isn't a valid page. The
 * result is in stored form; the host restores its own block bookkeeping.
 */
export function editPageDocument(
  page: PageDocument,
  edits: readonly TextEdit[],
): PageDocument {
  return parsePageFile(applyTextEdits(serializePageFile(page), edits));
}
