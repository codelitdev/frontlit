import type { DocsDiagnostic } from "@frontlit/text-editor/docs";
import {
  DocsGitHubApp,
  GitHubDocsError,
  validateGitDocsCheckOutput,
  type GitDocsCheckInput,
  type GitWriteGuard,
} from "./app";

/** One GitHub request carries at most 50 annotations; reports keep to one. */
export const GIT_CHECK_ANNOTATION_LIMIT = 50;

/** Only codes go to GitHub; messages stay in FrontLit. A diagnostic with a
 * file but no line is annotated at line 1 so the page is still identified. */
export function gitCheckAnnotations(diagnostics: DocsDiagnostic[]) {
  return diagnostics
    .filter((d) => d.file)
    .slice(0, GIT_CHECK_ANNOTATION_LIMIT)
    .map((d) => {
      const line = d.line && d.line > 0 ? d.line : 1;
      return {
        path: d.file!,
        start_line: line,
        end_line: line,
        annotation_level:
          d.severity === "error" ? ("failure" as const) : ("warning" as const),
        message: d.code,
      };
    });
}

/** Codes and the annotation count, never diagnostic messages. */
export function gitCheckCodes(diagnostics: DocsDiagnostic[], annotated: number) {
  const codes = [...new Set(diagnostics.map((d) => d.code))].slice(0, 100).join(", ");
  const total = diagnostics.filter((d) => d.file).length;
  return total > annotated
    ? `${codes}
${total} problems found; the first ${annotated} are annotated.`
    : codes;
}

/** Delivers one fixed, already validated report. A caller's durable report job
 * retries this independently from import/publication. Remote annotation counts
 * recover response-lost appends; replay never appends the same batch twice.
 * Each external mutation receives a fresh guard, including final completion. */
export async function deliverGitDocsCheck(
  app: DocsGitHubApp,
  token: string,
  owner: string,
  name: string,
  input: GitDocsCheckInput & { conclusion: "success" | "failure" | "neutral" },
  beforeWrite: GitWriteGuard,
) {
  if (!["success", "failure", "neutral"].includes(input.conclusion))
    throw new GitHubDocsError("GITHUB_INVALID_REQUEST");
  const { annotations = [], ...output } = input.output;
  // Bound the report, and reject every invalid batch before any remote mutation.
  if (annotations.length > 1000)
    throw new GitHubDocsError("GITHUB_CHECK_ANNOTATION_LIMIT", 409);
  validateGitDocsCheckOutput(output);
  for (let offset = 0; offset < annotations.length; offset += 50)
    validateGitDocsCheckOutput({
      ...output,
      annotations: annotations.slice(offset, offset + 50),
    });
  let run = await app.findCheckRun(token, owner, name, input);
  run ??= await app.createCheckRun(
    token,
    owner,
    name,
    { ...input, output },
    beforeWrite,
  );
  if (run.annotationsCount > annotations.length)
    throw new GitHubDocsError("GITHUB_CHECK_RECOVERY_CONFLICT", 409);
  if (run.status === "completed") {
    if (
      run.conclusion !== input.conclusion ||
      run.annotationsCount !== annotations.length
    )
      throw new GitHubDocsError("GITHUB_CHECK_RECOVERY_CONFLICT", 409);
    return run;
  }
  while (run.annotationsCount < annotations.length) {
    const expectedCount = Math.min(run.annotationsCount + 50, annotations.length);
    run = await app.updateCheckRun(
      token,
      owner,
      name,
      {
        ...input,
        checkRunId: run.id,
        // Append annotations while in progress; complete only after all batches.
        conclusion: undefined,
        output: {
          ...output,
          annotations: annotations.slice(run.annotationsCount, expectedCount),
        },
      },
      beforeWrite,
    );
    if (run.annotationsCount !== expectedCount)
      throw new GitHubDocsError("GITHUB_CHECK_RECOVERY_CONFLICT", 409);
  }
  const completed = await app.updateCheckRun(
    token,
    owner,
    name,
    {
      ...input,
      checkRunId: run.id,
      output,
    },
    beforeWrite,
  );
  if (
    completed.status !== "completed" ||
    completed.conclusion !== input.conclusion ||
    completed.annotationsCount !== annotations.length
  )
    throw new GitHubDocsError("GITHUB_INVALID_RESPONSE");
  return completed;
}
