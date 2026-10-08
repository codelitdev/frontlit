"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  getDocumentationGitSource,
  listAllDocumentationPages,
  listDocumentationGitProposals,
  submitDocumentationGitProposal,
  type DocumentationPage,
  type DocumentationGitProposal,
  type DocumentationGitSource,
} from "@/lib/api";
import { Button } from "@/components/ui/codelit/button";
import { Input } from "@/components/ui/codelit/input";
import { Label } from "@/components/ui/codelit/label";
import { Checkbox } from "@/components/ui/codelit/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/codelit/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/codelit/select";

type Action = "skip" | "publish" | "unpublished" | "remove";
type Submission = Parameters<typeof submitDocumentationGitProposal>[0];
export function DocumentationProposals({
  canPublish,
  triggerLabel = "Git proposals",
  initialDocumentId,
  initialRemovalIds = [],
  initialTitle,
  beforeOpen,
  disabled = false,
}: {
  canPublish: boolean;
  triggerLabel?: string;
  /** One document or several (e.g. a rejected proposal's captured files). */
  initialDocumentId?: string | string[];
  initialRemovalIds?: string[];
  initialTitle?: string;
  beforeOpen?: () => Promise<boolean>;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<DocumentationGitSource | null>(null);
  const [docs, setDocs] = useState<DocumentationPage[]>([]);
  const [history, setHistory] = useState<DocumentationGitProposal[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [actions, setActions] = useState<Record<string, Action>>({});
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<"pull_request" | "direct">("pull_request");
  const [directConsent, setDirectConsent] = useState(false);
  const [review, setReview] = useState<Submission | null>(null);
  async function load() {
    setSource(null);
    setDocs([]);
    setHistory([]);
    setCursor(null);
    setOpen(true);
    setBusy(true);
    setError(null);
    setReview(null);
    setActions({});
    setTitle("");
    setMode("pull_request");
    setDirectConsent(false);
    try {
      if (beforeOpen && !(await beforeOpen())) {
        throw new Error("Save your changes before creating a pull request.");
      }
      const [source, docs, proposals] = await Promise.all([
        getDocumentationGitSource(),
        listAllDocumentationPages(),
        listDocumentationGitProposals(),
      ]);
      setSource(source);
      setDocs(docs);
      const initialIds = ([] as string[]).concat(initialDocumentId ?? []);
      const initial: Record<string, Action> = {};
      for (const doc of docs) {
        if (initialRemovalIds.includes(doc.documentId))
          initial[doc.documentId] = "remove";
        else if (initialIds.includes(doc.documentId))
          initial[doc.documentId] = doc.status === "draft" ? "unpublished" : "publish";
      }
      setActions(initial);
      const first = docs.find((doc) => doc.documentId in initial);
      if (initialTitle) setTitle(initialTitle);
      else if (first) setTitle(`Update ${first.draftTitle}`);
      setHistory(proposals.items);
      setCursor(proposals.nextCursor);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not load proposals.");
    } finally {
      setBusy(false);
    }
  }
  async function loadMore() {
    if (!cursor) return;
    setBusy(true);
    setError(null);
    try {
      const page = await listDocumentationGitProposals({ cursor });
      setHistory((previous) => [...previous, ...page.items]);
      setCursor(page.nextCursor);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not load history.");
    } finally {
      setBusy(false);
    }
  }
  function prepareReview() {
    setError(null);
    const selected = docs
      .filter((doc) => ["publish", "unpublished"].includes(actions[doc.documentId]))
      .map((doc) => ({
        documentId: doc.documentId,
        expectedDraftVersion: doc.draftVersion,
        published: actions[doc.documentId] === "publish",
      }));
    const removals = docs
      .filter((doc) => actions[doc.documentId] === "remove")
      .map((doc) => ({
        documentId: doc.documentId,
        expectedDraftVersion: doc.draftVersion,
      }));
    if (!title.trim() || title.trim().length > 200) {
      setError("Enter a proposal title of up to 200 characters.");
      return;
    }
    if (
      selected.length + removals.length === 0 ||
      selected.length + removals.length > 1000
    ) {
      setError("Select between one and one thousand files.");
      return;
    }
    setReview({
      title: title.trim(),
      mode,
      selected,
      removals,
      idempotencyKey: crypto.randomUUID(),
    });
  }
  async function submit() {
    if (!review) return;
    setBusy(true);
    setError(null);
    try {
      const proposal = await submitDocumentationGitProposal(review);
      setOpen(false);
      router.push(`/content/documentation/github/proposals/${proposal.proposalId}`);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not submit. Retry this reviewed submission to avoid duplicate work.",
      );
    } finally {
      setBusy(false);
    }
  }
  const binding = source?.binding;
  const enabled =
    canPublish &&
    source?.source === "git" &&
    source.status === "connected" &&
    !!binding &&
    (mode === "direct"
      ? binding.capabilities.directCommit && directConsent
      : binding.capabilities.proposals);
  return (
    <>
      <Button
        variant={initialDocumentId ? "primary" : "outline"}
        size={initialDocumentId ? "sm" : "md"}
        disabled={disabled || busy}
        onClick={load}
      >
        {triggerLabel}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!busy) setOpen(next);
        }}
      >
        <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {review ? "Review Git submission" : "Git proposals"}
            </DialogTitle>
            <DialogDescription>
              Submit selected draft versions to the configured Git branch. PR review and
              merge happen in GitHub; publishing follows a successful branch import.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 space-y-5 overflow-y-auto pr-1">
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {busy && !source && <p>Loading proposals…</p>}
            {binding && (
              <p className="break-all text-sm">
                {binding.owner}/{binding.repository} · {binding.branch} ·{" "}
                {binding.directory || "Repository root"}
              </p>
            )}
            {!review && (
              <>
                {!canPublish && (
                  <p className="text-sm">
                    Publishing permission is required to submit a proposal.
                  </p>
                )}
                {canPublish && source?.source === "git" && (
                  <div className="space-y-4">
                    {source.status !== "connected" && (
                      <p className="text-sm">
                        Resume or reconnect this Git source before submitting.
                      </p>
                    )}
                    {binding &&
                      !binding.capabilities.proposals &&
                      !binding.capabilities.directCommit && (
                        <p className="text-sm">
                          Ask a workspace administrator to review and enable GitHub
                          write permissions in Source.
                        </p>
                      )}
                    <div className="space-y-2">
                      <Label htmlFor="git-proposal-title">Proposal title</Label>
                      <Input
                        id="git-proposal-title"
                        maxLength={200}
                        value={title}
                        disabled={busy}
                        onChange={(event) => setTitle(event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="git-proposal-mode">Submission mode</Label>
                      <Select
                        value={mode}
                        onValueChange={(value) => {
                          setMode(value as typeof mode);
                          setDirectConsent(false);
                        }}
                        disabled={busy}
                      >
                        <SelectTrigger id="git-proposal-mode">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pull_request">Pull request</SelectItem>
                          {binding?.capabilities.directCommit && (
                            <SelectItem value="direct">Direct commit</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    {mode === "direct" && (
                      <Label className="flex items-start gap-2">
                        <Checkbox
                          checked={directConsent}
                          onCheckedChange={(value) => setDirectConsent(value === true)}
                          disabled={busy}
                        />
                        I want to update the publishing branch directly. Repository
                        rules still apply.
                      </Label>
                    )}
                    <p className="text-sm text-muted-foreground">
                      Choose each file&apos;s published state after merge. Removing a
                      file leaves the local draft available. Only one open proposal per
                      document is allowed.
                    </p>
                    {docs.map((doc) => (
                      <div
                        key={doc.documentId}
                        className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_190px]"
                      >
                        <div className="min-w-0 text-sm">
                          <p className="font-medium">{doc.draftTitle}</p>
                          <p className="break-all text-muted-foreground">
                            {doc.draftGitSource?.sourcePath ?? "No Git source path"} ·
                            Draft version {doc.draftVersion}
                          </p>
                          {doc.draftGitSource?.base &&
                            doc.draftGitSource.base.sourcePath !==
                              doc.draftGitSource.sourcePath && (
                              <p className="break-all">
                                Move from {doc.draftGitSource.base.sourcePath}
                              </p>
                            )}
                        </div>
                        <Select
                          value={actions[doc.documentId] ?? "skip"}
                          onValueChange={(value) =>
                            setActions((previous) => ({
                              ...previous,
                              [doc.documentId]: value as Action,
                            }))
                          }
                          disabled={busy || !doc.draftGitSource}
                        >
                          <SelectTrigger aria-label={`Action for ${doc.draftTitle}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="skip">Do not include</SelectItem>
                            <SelectItem value="publish">Publish after merge</SelectItem>
                            <SelectItem value="unpublished">
                              Keep unpublished
                            </SelectItem>
                            {doc.draftGitSource?.base && (
                              <SelectItem value="remove">Remove Git file</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                )}
                <section className="space-y-2">
                  <h2 className="font-semibold">Proposal history</h2>
                  {history.length === 0 && !busy && (
                    <p className="text-sm text-muted-foreground">No proposals yet.</p>
                  )}
                  {history.map((proposal) => (
                    <Link
                      key={proposal.proposalId}
                      href={`/content/documentation/github/proposals/${proposal.proposalId}`}
                      className="block rounded-md border p-3 text-sm"
                    >
                      <p className="font-medium">{proposal.title}</p>
                      <p className="capitalize text-muted-foreground">
                        {proposal.status} · {proposal.captured.length} captured files ·{" "}
                        {new Date(proposal.createdAt).toLocaleString()}
                      </p>
                    </Link>
                  ))}
                  {cursor && (
                    <Button variant="outline" disabled={busy} onClick={loadMore}>
                      Load more proposals
                    </Button>
                  )}
                </section>
              </>
            )}
            {review && (
              <section className="space-y-3 text-sm">
                <h2 className="font-semibold">{review.title}</h2>
                <p>
                  {review.mode === "direct"
                    ? "Direct update to the publishing branch"
                    : "Open a pull request"}
                </p>
                {[...review.selected, ...review.removals].map((selection) => {
                  const doc = docs.find(
                    (doc) => doc.documentId === selection.documentId,
                  );
                  return (
                    <div key={selection.documentId} className="rounded-md border p-3">
                      <p>
                        {doc?.draftTitle ?? selection.documentId} · Version{" "}
                        {selection.expectedDraftVersion}
                      </p>
                      <p className="break-all">{doc?.draftGitSource?.sourcePath}</p>
                      <p>
                        {"published" in selection
                          ? selection.published
                            ? "Publish after merge"
                            : "Keep unpublished"
                          : "Remove Git file"}
                      </p>
                    </div>
                  );
                })}
                <p>
                  Later saves will not change this capture. Git validation or repository
                  rules can still reject it.
                </p>
              </section>
            )}
          </div>
          <DialogFooter className="flex-wrap gap-2 border-t pt-3">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => (review ? setReview(null) : setOpen(false))}
            >
              {review ? "Back" : "Close"}
            </Button>
            {canPublish && source?.source === "git" && (
              <Button
                disabled={busy || !enabled}
                onClick={review ? submit : prepareReview}
              >
                {busy
                  ? "Working…"
                  : review
                    ? "Submit captured versions"
                    : "Review selected files"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
