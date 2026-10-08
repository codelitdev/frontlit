/** DM-VALIDATE: shared, deterministic reports for authoring and import. */
export interface DocsDiagnostic {
  code: string;
  severity: "error" | "warning";
  blocksSave: boolean;
  blocksPublish: boolean;
  message: string;
  fieldPath?: string;
  file?: string;
  line?: number;
  column?: number;
  route?: string;
  documentId?: string;
  relatedFiles?: string[];
}

export function diagnostic(
  code: string,
  message: string,
  location: Partial<DocsDiagnostic> = {},
): DocsDiagnostic {
  return {
    code,
    message,
    severity: "error",
    blocksSave: true,
    blocksPublish: true,
    ...location,
  };
}

export function sortDiagnostics(items: DocsDiagnostic[]): DocsDiagnostic[] {
  return items.sort(
    (a, b) =>
      (a.file ?? a.documentId ?? "").localeCompare(b.file ?? b.documentId ?? "") ||
      (a.line ?? 0) - (b.line ?? 0) ||
      (a.column ?? 0) - (b.column ?? 0) ||
      (a.fieldPath ?? "").localeCompare(b.fieldPath ?? "") ||
      a.code.localeCompare(b.code),
  );
}

export class DocsContentError extends Error {
  readonly diagnostics: DocsDiagnostic[];
  constructor(diagnostics: DocsDiagnostic[]) {
    super("Documentation content is invalid.");
    this.name = "DocsContentError";
    this.diagnostics = sortDiagnostics(diagnostics);
  }
}
