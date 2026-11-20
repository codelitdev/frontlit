import {
  ContentError,
  diagnostic,
  sortDiagnostics,
  type Diagnostic,
} from "../core/diagnostics";

/** DM-VALIDATE: shared, deterministic reports for authoring and import. */
export type DocsDiagnostic = Diagnostic;
export { diagnostic, sortDiagnostics };

export class DocsContentError extends ContentError {
  constructor(diagnostics: DocsDiagnostic[]) {
    super(diagnostics, "Documentation content is invalid.");
    this.name = "DocsContentError";
  }
}

/** Runs a profile function and reports its failures as a `DocsContentError`. */
export function asDocsError<T>(run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof ContentError && !(error instanceof DocsContentError))
      throw new DocsContentError(error.diagnostics);
    throw error;
  }
}
