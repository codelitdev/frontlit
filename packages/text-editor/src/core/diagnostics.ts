/** Deterministic content reports, shared by the Markdown parser and the JSON validator. */
export interface Diagnostic {
  code: string;
  severity: "error" | "warning";
  blocksSave: boolean;
  blocksPublish: boolean;
  message: string;
  /** JSON path into the submitted document, e.g. `content.content[2].attrs.src`. */
  fieldPath?: string;
  file?: string;
  line?: number;
  column?: number;
  route?: string;
  documentId?: string;
  relatedFiles?: string[];
  /** Why a block may not be added now (availability check). */
  reason?: string;
}

/**
 * Generic diagnostic codes. A profile can rename them
 * (`options.diagnosticCodes`), so an existing API keeps its codes.
 */
export const DIAGNOSTIC_CODES = {
  /** A node outside the profile, or an unknown Markdown tag. */
  blockNotAllowed: "block_not_allowed",
  /** A mark outside the profile. */
  markNotAllowed: "mark_not_allowed",
  /** A block in the profile that may not be added now (`unavailable`). */
  blockUnavailable: "block_unavailable",
  /** Markdown syntax the format has no node for: raw HTML, footnotes, task lists… */
  unsupportedSyntax: "unsupported_syntax",
  /** An attribute or prop the node does not take, or a prop that is not a literal. */
  unsupportedAttribute: "unsupported_attribute",
  /** A malformed tree or attribute value. */
  invalidDocument: "invalid_document",
  /** Input over the byte, node or depth limits. */
  tooLarge: "too_large",
  /** A URL with a refused scheme, host or shape. */
  unsafeUrl: "unsafe_url",
  /** A local file path where an uploaded file or URL is required. */
  unmanagedBinary: "unmanaged_binary",
  /** A Markdown reference without its definition. */
  brokenLink: "broken_link",
} as const;
export type DiagnosticCode = (typeof DIAGNOSTIC_CODES)[keyof typeof DIAGNOSTIC_CODES];

export function diagnostic(
  code: string,
  message: string,
  location: Partial<Diagnostic> = {},
): Diagnostic {
  return {
    code,
    message,
    severity: "error",
    blocksSave: true,
    blocksPublish: true,
    ...location,
  };
}

export function sortDiagnostics<T extends Diagnostic>(items: T[]): T[] {
  return items.sort(
    (a, b) =>
      (a.file ?? a.documentId ?? "").localeCompare(b.file ?? b.documentId ?? "") ||
      (a.line ?? 0) - (b.line ?? 0) ||
      (a.column ?? 0) - (b.column ?? 0) ||
      (a.fieldPath ?? "").localeCompare(b.fieldPath ?? "") ||
      a.code.localeCompare(b.code),
  );
}

export class ContentError extends Error {
  readonly diagnostics: Diagnostic[];
  constructor(diagnostics: Diagnostic[], message = "Content is invalid.") {
    super(message);
    this.name = "ContentError";
    this.diagnostics = sortDiagnostics(diagnostics);
  }
}
