import {
  DocsContentError,
  diagnostic,
  isSafeDocsUrl,
  requireDocsContent,
  serializeDocsMarkdown,
} from "@frontlit/text-editor/docs";
import type { TextEditorContentRow } from "../db/schema";
import { updateDocumentationBodySchema } from "@frontlit/api-contract";

export function decodeDocumentationUpdate(input: unknown) {
  const result = updateDocumentationBodySchema.safeParse(input);
  if (!result.success)
    throw new DocsContentError(
      result.error.issues.map((issue) =>
        diagnostic("INVALID_REQUEST", "Invalid documentation mutation field.", {
          fieldPath: issue.path.map(String).join("."),
        }),
      ),
    );
  return result.data;
}

/** DM-VALIDATE: shared by REST/MCP saves and publication, before any write. */
export function normalizeDocumentationContent(input: unknown): TextEditorContentRow {
  const content = requireDocsContent(input);
  // Derivation failure must leave the prior draft intact too.
  serializeDocsMarkdown(content);
  return content as TextEditorContentRow;
}

export function validateDocumentationFeaturedImage(
  image: Record<string, unknown> | null | undefined,
) {
  if (image && !isSafeDocsUrl(image.url, true))
    throw new DocsContentError([
      diagnostic(
        "UNSAFE_URL",
        "Documentation featured images require a stable HTTPS URL.",
        { fieldPath: "featuredImage.url" },
      ),
    ]);
}

export function documentationErrorBody(error: DocsContentError) {
  return {
    error: "Documentation validation failed.",
    ...("retryAfter" in error ? { retryAfter: (error as any).retryAfter } : {}),
    code: error.diagnostics[0]?.code ?? "INVALID_DOCUMENT",
    diagnostics: error.diagnostics,
    ...("currentDraftVersion" in error
      ? { currentDraftVersion: (error as any).currentDraftVersion }
      : {}),
  };
}

export function documentationErrorStatus(
  error: DocsContentError,
): 400 | 403 | 409 | 422 | 429 {
  if (error.diagnostics.some((d) => d.code === "EVIDENCE_ACCESS_REQUIRED")) return 403;
  if ("retryAfter" in error) return 429;
  if (
    error.diagnostics.some((item) =>
      [
        "STALE_IMPROVEMENT",
        "IMPROVEMENT_DRAFT_EXISTS",
        "DRAFT_ALREADY_CREATED",
        "IMPROVEMENT_MERGED",
        "DOCUMENT_STILL_PUBLISHED",
        "STALE_DOCS_DRAFT",
        "SOURCE_REQUIRES_GIT",
        "STALE_PUBLICATION",
        "STALE_PURGE_PLAN",
        "IDEMPOTENCY_CONFLICT",
        "PUBLICATION_BUSY",
        "PUBLICATION_PENDING",
        "LEASE_LOST",
        "RECENT_OWNER_AUTH_REQUIRED",
        "PURGED_IDENTITY",
        "RESTORE_PENDING",
      ].includes(item.code),
    )
  )
    return 409;
  return error.diagnostics.some((item) => item.code === "INVALID_REQUEST") ? 400 : 422;
}

export function documentationRequestError(
  error: { body: any; query: any; pathParams: any; headers: any },
  _req: any,
  res: any,
) {
  const issues = [error.body, error.query, error.pathParams, error.headers].flatMap(
    (item) => item?.issues ?? [],
  );
  res.status(400).json(
    documentationErrorBody(
      new DocsContentError(
        issues.map((issue) =>
          diagnostic("INVALID_REQUEST", issue.message, {
            fieldPath: issue.path.join("."),
          }),
        ),
      ),
    ),
  );
}
