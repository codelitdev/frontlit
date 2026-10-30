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
import { Badge } from "@/components/ui/codelit/badge";
import { GitBranch, GitPullRequest, Lock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/codelit/dialog";

const IN_FLIGHT = ["queued", "validating", "prepared", "writing"];

function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled,
  label,
}: {
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (value: T) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <fieldset className="m-0 inline-flex min-w-0 rounded-lg border-0 bg-muted p-0.5">
      <legend className="sr-only">{label}</legend>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          disabled={disabled || option.disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-md px-2.5 py-1 font-medium text-xs focus-visible:shadow-[var(--shadow-focus)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
            value === option.value
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </fieldset>
  );
}

type Action = "skip" | "publish" | "unpublished" | "remove";
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
  const [idempotencyKey, setIdempotencyKey] = useState("");
  async function load() {
    setSource(null);
    setDocs([]);
    setHistory([]);
    setCursor(null);
    setOpen(true);
    setBusy(true);
    setError(null);
    setIdempotencyKey(crypto.randomUUID());
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
  // A proposal still being written locks its documents. A proposal whose PR is
  // open can take a further commit, so its documents can be added to it.
  const locked = new Map<string, DocumentationGitProposal>();
  const updatable = new Map<string, DocumentationGitProposal>();
  for (const proposal of history) {
    const target = IN_FLIGHT.includes(proposal.status)
      ? locked
      : proposal.status === "open" && proposal.mode === "pull_request"
        ? updatable
        : null;
    if (target)
      for (const captured of proposal.captured)
        if (!locked.has(captured.documentId) && !updatable.has(captured.documentId))
          target.set(captured.documentId, proposal);
  }
  async function submit() {
    setError(null);
    const selected = docs
      .filter((doc) => !locked.has(doc.documentId))
      .filter((doc) => ["publish", "unpublished"].includes(actions[doc.documentId]))
      .map((doc) => ({
        documentId: doc.documentId,
        expectedDraftVersion: doc.draftVersion,
        published: actions[doc.documentId] === "publish",
      }));
    const removals = docs
      .filter((doc) => !locked.has(doc.documentId))
      .filter((doc) => actions[doc.documentId] === "remove")
      .map((doc) => ({
        documentId: doc.documentId,
        expectedDraftVersion: doc.draftVersion,
      }));
    if (!title.trim() || title.trim().length > 200) {
      setError("Enter a title of up to 200 characters.");
      return;
    }
    if (selected.length + removals.length === 0) {
      setError("Select at least one draft to include.");
      return;
    }
    if (updateTargets.size > 1) {
      setError(
        "The selected drafts are in different open pull requests. Update one pull request at a time.",
      );
      return;
    }
    setBusy(true);
    try {
      const proposal = await submitDocumentationGitProposal({
        title: title.trim(),
        mode: updating ? "pull_request" : mode,
        selected,
        removals,
        ...(updating ? { updatesProposalId: updating.proposalId } : {}),
        idempotencyKey,
      });
      setOpen(false);
      router.push(`/content/documentation/github/proposals/${proposal.proposalId}`);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not submit. Retrying is safe and will not duplicate work.",
      );
    } finally {
      setBusy(false);
    }
  }
  const binding = source?.binding;
  const canWrite = Boolean(
    binding && (binding.capabilities.proposals || binding.capabilities.directCommit),
  );
  const enabled =
    canPublish &&
    source?.source === "git" &&
    source.status === "connected" &&
    !!binding &&
    (mode === "direct"
      ? binding.capabilities.directCommit && directConsent
      : binding.capabilities.proposals);
  const initialDocumentIds = ([] as string[]).concat(initialDocumentId ?? []);
  const gitDocs = docs.filter((doc) => doc.draftGitSource || doc.documentId in actions);
  const isRemoval = (id: string) => actions[id] === "remove";
  const included = (id: string) =>
    !locked.has(id) && (actions[id] ?? "skip") !== "skip";
  const selectable = gitDocs.filter(
    (doc) => !locked.has(doc.documentId) && doc.draftGitSource,
  );
  const includedCount = gitDocs.filter((doc) => included(doc.documentId)).length;
  const updateTargets = new Map<string, DocumentationGitProposal>();
  for (const doc of gitDocs) {
    const pr = updatable.get(doc.documentId);
    if (pr && included(doc.documentId)) updateTargets.set(pr.proposalId, pr);
  }
  const updating = updateTargets.size === 1 ? [...updateTargets.values()][0] : null;
  const publishCount = gitDocs.filter(
    (doc) => included(doc.documentId) && actions[doc.documentId] === "publish",
  ).length;
  const repoPath = binding ? `${binding.owner}/${binding.repository}` : "";
  const requestForAdmin = `Please enable pull request access for ${repoPath} in FrontLit: Settings → Integrations → GitHub → Manage → Review Git write permissions. The GitHub App also needs "contents: write" and "pull_requests: write" on the repo. This lets people open pull requests from the docs editor.`;
  function toggle(doc: DocumentationPage, checked: boolean) {
    setActions((previous) => ({
      ...previous,
      [doc.documentId]: !checked
        ? "skip"
        : initialRemovalIds.includes(doc.documentId)
          ? "remove"
          : doc.status === "draft"
            ? "unpublished"
            : "publish",
    }));
  }
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
        <DialogContent className="flex max-h-[90dvh] flex-col gap-5 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {updating
                ? `Update pull request #${updating.pullRequestNumber}`
                : "Create a pull request"}
            </DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[13px]">
              {binding ? (
                <>
                  <span className="inline-flex items-center gap-1.5">
                    <GitBranch className="size-3.5" />
                    {repoPath}
                  </span>
                  <span aria-hidden>·</span>
                  <span>
                    {mode === "direct"
                      ? binding.branch
                      : `frontlit/docs/… → ${binding.branch}`}
                  </span>
                  <span aria-hidden>·</span>
                  <span>{binding.directory || "/"}</span>
                </>
              ) : (
                "Submit draft changes to your docs repository."
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
            {busy && !source && (
              <p role="status" className="text-muted-foreground text-sm">
                Loading…
              </p>
            )}
            {!canPublish && (
              <p className="text-sm">
                Publishing permission is required to create a pull request.
              </p>
            )}
            {canPublish && source?.source === "git" && (
              <>
                {source.status !== "connected" && (
                  <div className="rounded-[0.625rem] bg-[var(--warning-soft)] px-4 py-3.5 text-sm">
                    Resume or reconnect the GitHub source in{" "}
                    <Link href="/settings/integrations" className="underline">
                      Settings › Integrations
                    </Link>{" "}
                    before submitting.
                  </div>
                )}
                {binding && !canWrite && (
                  <div className="flex items-start gap-3 rounded-[0.625rem] bg-[var(--warning-soft)] px-4 py-3.5 text-sm">
                    <Lock className="mt-0.5 size-[18px] shrink-0 text-[var(--warning)]" />
                    <div className="min-w-0 flex-1">
                      <b className="block font-semibold">
                        Pull request access isn&apos;t enabled yet
                      </b>
                      A workspace admin needs to enable it in{" "}
                      <Link href="/settings/integrations" className="underline">
                        Settings › Integrations
                      </Link>{" "}
                      (GitHub › Manage › Review Git write permissions). The GitHub App
                      must also have <code className="font-mono">contents: write</code>{" "}
                      and <code className="font-mono">pull_requests: write</code>. Your
                      drafts are saved meanwhile.
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(requestForAdmin)
                          .then(() => toast.success("Request copied"));
                      }}
                    >
                      Copy request for admin
                    </Button>
                  </div>
                )}
                <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
                  <div className="space-y-1.5">
                    <Label htmlFor="git-proposal-title">
                      {updating ? "Commit message" : "Pull request title"}
                    </Label>
                    <Input
                      id="git-proposal-title"
                      maxLength={200}
                      value={title}
                      disabled={busy}
                      onChange={(event) => setTitle(event.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Submit as</Label>
                    <div>
                      <Segmented
                        label="Submit as"
                        value={mode}
                        disabled={busy}
                        onChange={(value) => {
                          setMode(value);
                          setDirectConsent(false);
                        }}
                        options={[
                          { value: "pull_request", label: "Pull request" },
                          {
                            value: "direct",
                            label: `Commit to ${binding?.branch ?? "main"}`,
                            disabled: !binding?.capabilities.directCommit,
                          },
                        ]}
                      />
                    </div>
                  </div>
                </div>
                {mode === "direct" ? (
                  <Label className="flex items-start gap-2 font-normal">
                    <Checkbox
                      checked={directConsent}
                      onCheckedChange={(value) => setDirectConsent(value === true)}
                      disabled={busy}
                    />
                    I want to update {binding?.branch ?? "the publishing branch"}{" "}
                    directly. Repository rules still apply.
                  </Label>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    Opens from a new <code className="font-mono">frontlit/docs/…</code>{" "}
                    branch. Review and merge happen in GitHub.
                  </p>
                )}
                {updating && (
                  <div className="rounded-[0.625rem] bg-muted px-4 py-3 text-sm">
                    This adds a commit to open pull request{" "}
                    {updating.pullRequestUrl ? (
                      <a
                        href={updating.pullRequestUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-primary hover:underline"
                      >
                        #{updating.pullRequestNumber}
                      </a>
                    ) : (
                      `#${updating.pullRequestNumber}`
                    )}{" "}
                    with your latest drafts. No new pull request is opened.
                  </div>
                )}
                {initialDocumentIds.some((id) => locked.has(id)) && (
                  <div className="rounded-[0.625rem] bg-muted px-4 py-3 text-sm">
                    This doc is in a pull request that is still being created. Try again
                    in a moment.
                  </div>
                )}
                <section className="space-y-2.5">
                  <div className="flex items-center justify-between text-sm">
                    <h3 className="font-semibold">
                      Drafts to include{" "}
                      <span className="font-normal text-muted-foreground">
                        {includedCount} of {gitDocs.length} selected
                      </span>
                    </h3>
                    {selectable.length > 0 && (
                      <button
                        type="button"
                        className="font-semibold text-primary text-[13px] hover:underline"
                        onClick={() =>
                          setActions((previous) => {
                            const next = { ...previous };
                            const all = selectable.every((d) => included(d.documentId));
                            for (const doc of selectable)
                              next[doc.documentId] = all
                                ? "skip"
                                : initialRemovalIds.includes(doc.documentId)
                                  ? "remove"
                                  : doc.status === "draft"
                                    ? "unpublished"
                                    : "publish";
                            return next;
                          })
                        }
                      >
                        {selectable.every((d) => included(d.documentId))
                          ? "Clear"
                          : "Select all"}
                      </button>
                    )}
                  </div>
                  <ul className="divide-y overflow-clip rounded-[0.625rem] border border-border">
                    {gitDocs.map((doc) => {
                      const pending = locked.get(doc.documentId);
                      const inPr = updatable.get(doc.documentId);
                      const on = included(doc.documentId);
                      const removal = isRemoval(doc.documentId);
                      const letter = removal
                        ? "D"
                        : doc.draftGitSource?.base
                          ? "M"
                          : "A";
                      return (
                        <li
                          key={doc.documentId}
                          className={cn(
                            "flex items-center gap-3 px-4 py-3",
                            on && "bg-[var(--primary-soft)]",
                            pending && "bg-muted/50",
                          )}
                        >
                          <Checkbox
                            aria-label={`Include ${doc.draftTitle}`}
                            checked={on}
                            disabled={busy || !!pending || !doc.draftGitSource}
                            onCheckedChange={(value) => toggle(doc, value === true)}
                          />
                          <div className="min-w-0 flex-1 text-sm">
                            <p className="truncate font-medium">{doc.draftTitle}</p>
                            <p className="mt-0.5 flex min-w-0 items-center gap-2 text-muted-foreground text-xs">
                              <span
                                title={
                                  letter === "A"
                                    ? "New file"
                                    : letter === "D"
                                      ? "Deleted file"
                                      : "Modified file"
                                }
                                className="grid size-4 shrink-0 place-items-center rounded bg-muted font-mono font-semibold text-[10px]"
                              >
                                {letter}
                              </span>
                              <span className="truncate font-mono">
                                {doc.draftGitSource?.sourcePath ?? "No Git file"}
                              </span>
                              <span className="shrink-0">
                                · draft v{doc.draftVersion}
                              </span>
                            </p>
                            {on && inPr && (
                              <p className="mt-0.5 flex items-center gap-1 text-muted-foreground text-xs">
                                <GitPullRequest className="size-3" />
                                Adds a commit to PR #{inPr.pullRequestNumber}
                              </p>
                            )}
                            {doc.draftGitSource?.base &&
                              doc.draftGitSource.base.sourcePath !==
                                doc.draftGitSource.sourcePath && (
                                <p className="mt-0.5 truncate text-muted-foreground text-xs">
                                  Moves from{" "}
                                  <span className="font-mono">
                                    {doc.draftGitSource.base.sourcePath}
                                  </span>
                                </p>
                              )}
                          </div>
                          {pending ? (
                            <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground text-xs">
                              <GitPullRequest className="size-3.5" />
                              Pull request being created
                            </span>
                          ) : on && !removal ? (
                            <Segmented
                              label={`Published state for ${doc.draftTitle}`}
                              value={
                                actions[doc.documentId] as "publish" | "unpublished"
                              }
                              disabled={busy}
                              onChange={(value) =>
                                setActions((previous) => ({
                                  ...previous,
                                  [doc.documentId]: value,
                                }))
                              }
                              options={[
                                { value: "publish", label: "Publish on merge" },
                                { value: "unpublished", label: "Merge as draft" },
                              ]}
                            />
                          ) : (
                            <span className="shrink-0 text-muted-foreground text-xs">
                              {removal
                                ? "Removes the Git file"
                                : inPr
                                  ? `In open PR #${inPr.pullRequestNumber}`
                                  : "Stays a local draft"}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  <p className="text-muted-foreground text-xs">
                    Left-out drafts stay in FrontLit. Each doc can be in one open pull
                    request at a time.
                  </p>
                </section>
              </>
            )}
            {!initialDocumentId && source?.source === "git" && (
              <section className="space-y-2">
                <h3 className="font-semibold text-sm">Recent pull requests</h3>
                {history.length === 0 && !busy && (
                  <p className="text-muted-foreground text-sm">
                    Nothing submitted yet.
                  </p>
                )}
                {history.map((proposal) => (
                  <Link
                    key={proposal.proposalId}
                    href={`/content/documentation/github/proposals/${proposal.proposalId}`}
                    className="flex items-center justify-between gap-3 rounded-[0.625rem] border border-border px-4 py-3 text-sm hover:bg-muted/50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {proposal.title}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {proposal.captured.length}{" "}
                        {proposal.captured.length === 1 ? "file" : "files"} ·{" "}
                        {new Date(proposal.createdAt).toLocaleString()}
                      </span>
                    </span>
                    <Badge variant="neutral" className="capitalize">
                      {proposal.status}
                    </Badge>
                  </Link>
                ))}
                {cursor && (
                  <Button variant="outline" disabled={busy} onClick={loadMore}>
                    Load more
                  </Button>
                )}
              </section>
            )}
          </div>
          <DialogFooter className="mt-0 flex-wrap justify-between gap-2 border-t pt-4">
            <span className="text-muted-foreground text-xs">
              {includedCount} {includedCount === 1 ? "file" : "files"} · {publishCount}{" "}
              publish on merge
            </span>
            <span className="flex gap-2">
              <Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
                Cancel
              </Button>
              {canPublish && source?.source === "git" && (
                <Button
                  disabled={busy || !enabled || includedCount === 0}
                  onClick={submit}
                >
                  {busy
                    ? "Working…"
                    : updating
                      ? `Update PR #${updating.pullRequestNumber}`
                      : mode === "direct"
                        ? "Commit to branch"
                        : "Create pull request"}
                </Button>
              )}
            </span>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
