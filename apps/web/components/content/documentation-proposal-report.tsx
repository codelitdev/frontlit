"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getDocumentationGitProposal, type DocumentationGitProposal } from "@/lib/api";
import { useWorkspaceAccess } from "@/components/workspace/workspace-access";
import { useSetBreadcrumb } from "@/components/workspace/breadcrumb-context";
import { ScrollablePage } from "@/components/workspace/scrollable-page";
import { Button } from "@/components/ui/codelit/button";
import { Card, CardContent } from "@/components/ui/codelit/card";
import { DocumentationProposals } from "./documentation-proposals";

const descriptions: Record<DocumentationGitProposal["status"], string> = {
  queued: "Waiting to validate the selected files.",
  validating: "Validating the complete proposed documentation.",
  prepared: "Validation completed; waiting to write to GitHub.",
  writing: "Writing the captured proposal to GitHub.",
  open: "Review and merge this pull request in GitHub. Public documentation is unchanged by this proposal.",
  merged: "Merged into Git. Documentation publication is still pending.",
  published: "The merged documentation candidate was published successfully.",
  closed: "Closed without merging. Your local drafts remain available.",
  failed: "The proposal failed. Your local drafts remain available.",
  conflict:
    "The proposal conflicted with GitHub changes or repository rules. Review Git and your retained drafts before submitting again.",
  canceled:
    "Local proposal work was canceled. Existing GitHub references may still exist.",
};
export function DocumentationProposalReport({ proposalId }: { proposalId: string }) {
  useSetBreadcrumb([
    { label: "Documentation", href: "/content?type=documentation" },
    { label: "Git proposal" },
  ]);
  const { currentTeam } = useWorkspaceAccess();
  const teamId = currentTeam?.teamId;
  const canRead = Boolean(
    currentTeam?.isOwner ||
      currentTeam?.effectivePermissions.includes("documentation:read"),
  );
  const [record, setRecord] = useState<{
    teamId?: string;
    proposalId: string;
    proposal: DocumentationGitProposal;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const proposal =
    canRead && record?.teamId === teamId && record.proposalId === proposalId
      ? record.proposal
      : null;
  async function refresh() {
    setBusy(true);
    setError(null);
    try {
      setRecord({
        teamId,
        proposalId,
        proposal: await getDocumentationGitProposal(proposalId),
      });
    } catch (error) {
      setRecord(null);
      setError(error instanceof Error ? error.message : "Could not load the proposal.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    setRecord(null);
    if (teamId && canRead) void refresh();
  }, [teamId, proposalId, canRead]);
  useEffect(() => {
    if (
      !proposal ||
      !["queued", "validating", "prepared", "writing", "open", "merged"].includes(
        proposal.status,
      )
    )
      return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 10_000);
    return () => clearInterval(timer);
  }, [teamId, proposalId, proposal?.status, canRead]);
  return (
    <ScrollablePage>
      <div className="mx-auto w-full max-w-3xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">
            {proposal?.title ?? "Git proposal"}
          </h1>
          <Button variant="outline" disabled={busy || !canRead} onClick={refresh}>
            Refresh status
          </Button>
        </div>
        <Link href="/content?type=documentation" className="text-sm underline">
          Back to documentation
        </Link>
        {currentTeam && !canRead && (
          <p role="alert">
            Documentation read permission is required to view this proposal.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {busy && !proposal && <p>Loading proposal…</p>}
        {proposal && (
          <>
            <Card>
              <CardContent className="space-y-3 pt-6">
                <p className="font-medium capitalize">
                  {proposal.status.replaceAll("_", " ")}
                </p>
                <p>{descriptions[proposal.status]}</p>
                {proposal.mode === "direct" &&
                  proposal.status === "conflict" &&
                  proposal.diagnostics.some(
                    (d) => d.code === "GITHUB_WRITE_REJECTED",
                  ) && (
                    <div className="space-y-2">
                      <p>
                        GitHub rejected the branch update. Review repository rules and
                        submit the retained drafts through a pull request.
                      </p>
                      <DocumentationProposals
                        canPublish={Boolean(
                          currentTeam?.isOwner ||
                            currentTeam?.effectivePermissions.includes(
                              "documentation:publish",
                            ),
                        )}
                        triggerLabel="Create a pull request"
                        initialDocumentId={proposal.captured
                          .filter((doc) => doc.targetPath !== null)
                          .map((doc) => doc.documentId)}
                        initialRemovalIds={proposal.captured
                          .filter((doc) => doc.targetPath === null)
                          .map((doc) => doc.documentId)}
                        initialTitle={proposal.title}
                      />
                    </div>
                  )}
                <p className="text-sm text-muted-foreground">
                  {proposal.mode === "direct" ? "Direct commit" : "Pull request"} ·
                  Created {new Date(proposal.createdAt).toLocaleString()}
                </p>
                {proposal.pullRequestUrl && (
                  <a
                    className="underline"
                    href={proposal.pullRequestUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open pull request #{proposal.pullRequestNumber}
                  </a>
                )}
                <dl className="grid gap-2 text-sm">
                  {[
                    ["Branch", proposal.branch],
                    ["Base commit", proposal.baseSha],
                    ["Proposal commit", proposal.commitSha],
                    ["Merged commit", proposal.mergedCommitSha],
                  ].map(
                    ([label, value]) =>
                      value && (
                        <div key={label} className="break-all">
                          <dt className="text-muted-foreground">{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      ),
                  )}
                </dl>
              </CardContent>
            </Card>
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Captured files</h2>
              <p className="text-sm text-muted-foreground">
                This submission contains the versions below. Later saves stay separate
                from this proposal.
              </p>
              {proposal.captured.map((doc) => (
                <Card key={doc.documentId}>
                  <CardContent className="space-y-1 pt-4 text-sm">
                    <p className="break-all">
                      {doc.sourcePath && doc.targetPath !== doc.sourcePath
                        ? `${doc.sourcePath} → ${doc.targetPath ?? "Remove file"}`
                        : (doc.targetPath ?? doc.sourcePath ?? doc.documentId)}
                    </p>
                    <p>Captured draft version {doc.draftVersion}</p>
                    <Link
                      className="underline"
                      href={`/editor/content/documentation/${doc.documentId}`}
                    >
                      Open current draft
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </section>
            {proposal.diagnostics.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-lg font-semibold">Diagnostics</h2>
                {proposal.diagnostics.map((diagnostic, index) => (
                  <p key={index} className="text-sm">
                    {diagnostic.message ?? diagnostic.code.replaceAll("_", " ")}
                    {typeof diagnostic.file === "string" ? ` · ${diagnostic.file}` : ""}
                  </p>
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </ScrollablePage>
  );
}
