"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  getDocumentationGitCheck,
  listDocumentationGitChecks,
  type DocumentationGitCheck,
} from "@/lib/api";
import { useWorkspaceAccess } from "@/components/workspace/workspace-access";
import { useSetBreadcrumb } from "@/components/workspace/breadcrumb-context";
import { ScrollablePage } from "@/components/workspace/scrollable-page";
import { Button } from "@/components/ui/codelit/button";
import { Card, CardContent } from "@/components/ui/codelit/card";
export function DocumentationCheckReports({ checkId }: { checkId?: string }) {
  const { currentTeam } = useWorkspaceAccess();
  const teamId = currentTeam?.teamId;
  const canRead = Boolean(
    currentTeam?.isOwner ||
      currentTeam?.effectivePermissions.includes("documentation:read"),
  );
  useSetBreadcrumb([
    { label: "Documentation", href: "/content?type=documentation" },
    { label: "Git checks", href: "/content/documentation/github/checks" },
    ...(checkId ? [{ label: "Report" }] : []),
  ]);
  const [record, setRecord] = useState<{
    teamId: string;
    checkId?: string;
    items: DocumentationGitCheck[];
    cursor: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  const visible =
    canRead && record?.teamId === teamId && record.checkId === checkId ? record : null;
  async function load(cursor?: string) {
    if (!teamId || !canRead) return;
    const request = ++sequence.current;
    setBusy(true);
    setError(null);
    try {
      const data = checkId
        ? { items: [await getDocumentationGitCheck(checkId)], nextCursor: null }
        : await listDocumentationGitChecks(cursor ? { cursor } : {});
      if (request !== sequence.current) return;
      setRecord((previous) => ({
        teamId,
        checkId,
        items:
          cursor && previous?.teamId === teamId
            ? [...previous.items, ...data.items]
            : data.items,
        cursor: data.nextCursor,
      }));
    } catch (error) {
      if (request !== sequence.current) return;
      setRecord(null);
      setError(
        error instanceof Error ? error.message : "Could not load check reports.",
      );
    } finally {
      if (request === sequence.current) setBusy(false);
    }
  }
  useEffect(() => {
    setRecord(null);
    setError(null);
    setBusy(false);
    void load();
    return () => {
      sequence.current++;
    };
  }, [teamId, canRead, checkId]);
  return (
    <ScrollablePage>
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Git documentation checks</h1>
          <Button
            variant="outline"
            disabled={busy || !canRead}
            onClick={() => void load()}
          >
            Refresh reports
          </Button>
        </div>
        <Link href="/content?type=documentation" className="text-sm underline">
          Back to documentation
        </Link>
        <p>
          PR validation checks the proposed merge. Check delivery is separate from
          validation and publication. Publishing-branch checks report the actual
          publication outcome.
        </p>
        {!canRead && currentTeam && (
          <p role="alert">
            Documentation read permission is required to view these reports.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        {busy && <p role="status">Loading reports…</p>}
        {visible?.items.length === 0 && <p>No Git documentation check reports yet.</p>}
        {visible?.items.map((check) => (
          <Card key={check.checkId}>
            <CardContent className="space-y-3 pt-5">
              <h2 className="font-semibold">
                {check.kind === "publication"
                  ? "Publishing branch"
                  : `Pull request #${check.pullRequestNumber}`}
              </h2>
              <p>Check delivery: {check.status}</p>
              {check.lastError && (
                <p role="status">
                  {check.errorPhase === "delivery" ? "Report delivery" : "Validation"}:{" "}
                  {check.lastError}.{" "}
                  {check.errorPhase === "delivery" &&
                    `The recorded ${check.kind === "publication" ? "publication" : "validation"} result is retained while reporting retries.`}
                </p>
              )}
              {!check.result && !check.publicationResult && (
                <p>The complete merge has not been validated yet.</p>
              )}
              {check.publicationResult && (
                <>
                  <p>
                    Publication: {check.publicationResult.outcome} ·{" "}
                    {check.publicationResult.publishedCount} public docs
                  </p>
                  <p className="break-all font-mono">
                    Commit: {check.publicationResult.commitSha}
                  </p>
                  {check.publicationResult.publicationId && (
                    <p>Publication ID: {check.publicationResult.publicationId}</p>
                  )}
                  {check.publicationResult.redacted && (
                    <p>
                      Diagnostic details are hidden by the current documentation policy.
                    </p>
                  )}
                  {checkId &&
                    check.publicationResult.diagnostics.map((item, index) => (
                      <p key={index}>
                        <strong>{item.code}</strong>: {item.message}
                      </p>
                    ))}
                </>
              )}
              {check.result && (
                <>
                  <p>
                    Validation: {check.result.outcome} · {check.result.fileCount}{" "}
                    managed files · {check.result.publishedCount} public docs
                  </p>
                  <dl className="space-y-2 text-sm">
                    <div>
                      <dt>PR head</dt>
                      <dd className="break-all font-mono">{check.result.headSha}</dd>
                    </div>
                    <div>
                      <dt>Publishing base</dt>
                      <dd className="break-all font-mono">{check.result.baseSha}</dd>
                    </div>
                    <div>
                      <dt>Test merge</dt>
                      <dd className="break-all font-mono">
                        {check.result.mergeSha ?? "Unavailable"}
                      </dd>
                    </div>
                  </dl>
                  {check.result.redacted && (
                    <p>
                      Diagnostic details are hidden by the current documentation policy.
                    </p>
                  )}
                  {checkId && check.result.diagnostics.length > 0 && (
                    <ul className="space-y-2">
                      {check.result.diagnostics.map((item, index) => (
                        <li key={index}>
                          <strong>{item.code}</strong>: {item.message}
                          {item.file && (
                            <span className="block break-all text-sm">
                              {item.file}
                              {item.line ? `:${item.line}` : ""}
                            </span>
                          )}
                          {item.route && (
                            <span className="block break-all text-sm">
                              Route: {item.route}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
              <p className="text-sm">{new Date(check.createdAt).toLocaleString()}</p>
              {!checkId && (
                <Link
                  className="text-sm underline"
                  href={`/content/documentation/github/checks/${check.checkId}`}
                >
                  Open private report
                </Link>
              )}
            </CardContent>
          </Card>
        ))}
        {visible?.cursor && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void load(visible.cursor!)}
          >
            Load more reports
          </Button>
        )}
      </div>
    </ScrollablePage>
  );
}
