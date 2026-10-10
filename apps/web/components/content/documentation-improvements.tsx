"use client";
import { useEffect, useEffectEvent, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/codelit/button";
import { Input } from "@/components/ui/codelit/input";
import { Textarea } from "@/components/ui/codelit/textarea";
import { Label } from "@/components/ui/codelit/label";
import { Badge } from "@/components/ui/codelit/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/codelit/select";
import { ArrowLeft, ChevronRight, ExternalLink } from "lucide-react";
import { Callout, ConsentRow } from "@/components/content/documentation-connect-parts";
import { cn } from "@/lib/utils";
import { documentationPanel } from "@/components/content/documentation-panel";
import { useWorkspaceAccess } from "@/components/workspace/workspace-access";
import {
  listDocumentationImprovements,
  getDocumentationImprovement,
  reviewDocumentationImprovement,
  createDocumentationImprovementDraft,
  type DocumentationImprovement,
  type DocumentationPage,
} from "@/lib/api";

const STATES = [
  { value: "open", label: "Open" },
  { value: "dismissed", label: "Dismissed" },
  { value: "draft_created", label: "Draft created" },
  { value: "published", label: "Published" },
];

const humanize = (value: string) => value.replaceAll("_", " ");

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-[0.625rem] border border-border p-4">
      <h3 className="font-semibold text-sm">{title}</h3>
      {children}
    </section>
  );
}

export function DocumentationImprovements({
  docs,
  onChanged,
  inline = false,
  triggerLabel = "Improvements",
}: {
  docs: DocumentationPage[];
  onChanged: () => Promise<void>;
  inline?: boolean;
  triggerLabel?: string;
}) {
  const { currentTeam } = useWorkspaceAccess();
  const canWrite = Boolean(
    currentTeam?.isOwner ||
      currentTeam?.effectivePermissions.includes("documentation:write"),
  );
  const canReview =
    canWrite &&
    Boolean(
      currentTeam?.isOwner ||
        currentTeam?.effectivePermissions.includes("helpdesk:read"),
    );
  const { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } =
    documentationPanel(inline);
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<DocumentationImprovement[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [state, setState] = useState("open");
  const [item, setItem] = useState<DocumentationImprovement | null>(null);
  const [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [correction, setCorrection] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const [target, setTarget] = useState(""),
    [mergeTarget, setMergeTarget] = useState("");
  const [receipt, setReceipt] = useState<{
    documentId: string;
    draftVersion: number;
  } | null>(null);
  async function action(run: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await run();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }
  async function load(next?: string, filter = state) {
    const page = await listDocumentationImprovements({
      limit: 20,
      state: filter as "open",
      ...(next ? { cursor: next } : {}),
    });
    setItems((previous) => (next ? [...previous, ...page.items] : page.items));
    setCursor(page.nextCursor);
  }
  function select(row: DocumentationImprovement) {
    setItem(row);
    setTitle(row.approved?.title ?? "");
    setDescription(row.approved?.description ?? "");
    setCorrection(row.approved?.correction ?? "");
    setConfirmed(false);
    setTarget("");
    setMergeTarget("");
    setReceipt(null);
  }
  async function review(input: Parameters<typeof reviewDocumentationImprovement>[1]) {
    if (!item) return;
    await reviewDocumentationImprovement(item.itemId, input);
    const refreshed = await getDocumentationImprovement(item.itemId);
    select(refreshed);
    await load();
  }
  const loadPanel = useEffectEvent(() => {
    void action(() => load());
  });
  useEffect(() => {
    if (inline) loadPanel();
  }, [inline]);
  const itemLabel = (row: DocumentationImprovement) =>
    row.approved?.title ?? (row.reason ? humanize(row.reason) : "Approved artifact");
  return (
    <>
      {!inline && (
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            action(async () => {
              setOpen(true);
              setItem(null);
              await load();
            })
          }
        >
          {triggerLabel}
        </Button>
      )}
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent className="flex max-h-[90dvh] flex-col gap-5 sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Documentation gaps</DialogTitle>
            <DialogDescription>
              Questions readers asked that your docs couldn&apos;t answer. Approve a
              redacted fix and it becomes a private draft for normal publication review.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
            {!item ? (
              <>
                <div
                  role="tablist"
                  aria-label="Gap state"
                  className="flex flex-wrap gap-1.5"
                >
                  {STATES.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      role="tab"
                      aria-selected={state === s.value}
                      disabled={busy}
                      onClick={() => {
                        setState(s.value);
                        void action(() => load(undefined, s.value));
                      }}
                      className={cn(
                        "rounded-full border px-3 py-1 font-medium text-[13px] focus-visible:shadow-[var(--shadow-focus)] focus-visible:outline-none disabled:opacity-50",
                        state === s.value
                          ? "border-primary bg-[var(--primary-soft)] text-primary"
                          : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                {items.length > 0 && (
                  <ul className="divide-y overflow-clip rounded-[0.625rem] border border-border">
                    {items.map((row) => (
                      <li key={row.itemId}>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => select(row)}
                          className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm hover:bg-muted/50 focus-visible:shadow-[var(--shadow-focus)] focus-visible:outline-none"
                        >
                          <span className="min-w-0 flex-1 font-medium">
                            {itemLabel(row)}
                          </span>
                          {row.evidenceCount !== undefined && (
                            <Badge variant="neutral">
                              {row.evidenceCount}{" "}
                              {row.evidenceCount === 1 ? "question" : "questions"}
                            </Badge>
                          )}
                          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {!items.length && (
                  <p
                    role="status"
                    className="rounded-[0.625rem] border border-border border-dashed px-4 py-10 text-center text-muted-foreground text-sm"
                  >
                    {busy ? "Loading…" : `No ${humanize(state)} gaps right now.`}
                  </p>
                )}
                {cursor && (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => action(() => load(cursor))}
                  >
                    Load more
                  </Button>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => setItem(null)}
                  >
                    <ArrowLeft className="size-4" />
                    All gaps
                  </Button>
                  <span className="flex items-center gap-2 text-muted-foreground text-xs">
                    <Badge variant="neutral" className="capitalize">
                      {humanize(item.state)}
                    </Badge>
                    Version {item.version}
                  </span>
                </div>
                <h3 className="font-semibold text-base leading-tight">
                  {itemLabel(item)}
                </h3>
                {item.mergedIntoId && (
                  <Callout tone="info" title="Merged">
                    Evidence was merged into another gap ({item.mergedIntoId}).
                  </Callout>
                )}
                {item.evidence && (
                  <Panel title="What readers asked">
                    <ul aria-label="Authorized support evidence" className="space-y-2">
                      {item.evidence.map((e) => (
                        <li
                          className="space-y-1.5 rounded-lg bg-muted/50 px-3.5 py-3 text-sm"
                          key={e.evidenceId}
                        >
                          <p className="whitespace-pre-wrap">{e.question}</p>
                          <p className="flex items-center justify-between gap-3 text-muted-foreground text-xs">
                            <span className="capitalize">{humanize(e.trigger)}</span>
                            <Link
                              href={`/?ticket=${e.ticketId}`}
                              className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                            >
                              Open conversation
                              <ExternalLink className="size-3" />
                            </Link>
                          </p>
                        </li>
                      ))}
                    </ul>
                  </Panel>
                )}
                {item.approved && (
                  <Panel title={`Approved text · version ${item.approved.version}`}>
                    <div className="space-y-2 text-sm">
                      <p className="font-medium">{item.approved.title}</p>
                      <p className="whitespace-pre-wrap text-muted-foreground">
                        {item.approved.description}
                      </p>
                      <pre className="whitespace-pre-wrap break-words rounded-lg bg-muted/50 px-3.5 py-3 text-[13px]">
                        {item.approved.correction}
                      </pre>
                      <p className="text-muted-foreground text-xs">
                        Reviewer confirmed no customer-specific details.
                      </p>
                    </div>
                  </Panel>
                )}
                {canReview && !item.draftDocumentId && !item.mergedIntoId && (
                  <Panel title="Approve a redacted fix">
                    <p className="text-muted-foreground text-sm">
                      Write a standalone description and correction. Remove names,
                      account details, internal URLs and transcripts. If the facts are
                      uncertain, keep the gap open.
                    </p>
                    <Field label="Draft title" htmlFor="improvement-title">
                      <Input
                        id="improvement-title"
                        maxLength={200}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                      />
                    </Field>
                    <Field
                      label="Redacted description"
                      htmlFor="improvement-description"
                    >
                      <Textarea
                        id="improvement-description"
                        maxLength={1000}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                      />
                    </Field>
                    <Field
                      label="Proposed correction (Markdown)"
                      htmlFor="improvement-correction"
                    >
                      <Textarea
                        id="improvement-correction"
                        className="min-h-32 font-mono text-[13px]"
                        maxLength={16000}
                        value={correction}
                        onChange={(e) => setCorrection(e.target.value)}
                      />
                    </Field>
                    <ConsentRow
                      checked={confirmed}
                      onChange={setConfirmed}
                      disabled={busy}
                    >
                      I reviewed this text and it contains no customer-specific details.
                    </ConsentRow>
                    <Button
                      disabled={
                        busy ||
                        !confirmed ||
                        !title.trim() ||
                        !description.trim() ||
                        !correction.trim()
                      }
                      onClick={() =>
                        action(() =>
                          review({
                            action: "approve-summary",
                            expectedVersion: item.version,
                            title,
                            description,
                            correction,
                            noCustomerDetails: true,
                          }),
                        )
                      }
                    >
                      Approve redacted text
                    </Button>
                  </Panel>
                )}
                {canWrite &&
                  item.approved &&
                  !item.draftDocumentId &&
                  item.state === "open" && (
                    <Panel title="Create a draft">
                      <Field label="Draft target">
                        <Select
                          value={target || "new"}
                          onValueChange={(value) =>
                            setTarget(value === "new" ? "" : value)
                          }
                        >
                          <SelectTrigger aria-label="Draft target">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="new">Create new document</SelectItem>
                            {docs.map((d) => (
                              <SelectItem key={d.documentId} value={d.documentId}>
                                {d.draftTitle} · version {d.draftVersion}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      {target && (
                        <Callout title="This replaces the saved draft">
                          The selected document&apos;s saved draft is replaced with the
                          approved text. A newer draft blocks the operation.
                        </Callout>
                      )}
                      <Button
                        disabled={busy}
                        onClick={() =>
                          action(async () => {
                            const existing = docs.find((d) => d.documentId === target);
                            const result = await createDocumentationImprovementDraft(
                              item.itemId,
                              {
                                expectedVersion: item.version,
                                approvedSummaryVersion: item.approved!.version,
                                idempotencyKey: `improvement:${item.itemId}:${item.approved!.version}`,
                                ...(existing
                                  ? {
                                      targetDocumentId: existing.documentId,
                                      expectedDraftVersion: existing.draftVersion,
                                    }
                                  : {}),
                              },
                            );
                            setReceipt(result);
                            setItem(await getDocumentationImprovement(item.itemId));
                            await load();
                            await onChanged();
                          })
                        }
                      >
                        Create private draft
                      </Button>
                    </Panel>
                  )}
                {(receipt || item.draftDocumentId) && (
                  <Button asChild variant="outline">
                    <Link
                      href={`/editor/content/documentation/${receipt?.documentId ?? item.draftDocumentId}`}
                    >
                      Open linked draft
                    </Link>
                  </Button>
                )}
                {item.publicationId && (
                  <p className="text-muted-foreground text-sm">
                    Accepted publication: {item.publicationId}. Publication does not
                    assert that the support issue is resolved.
                  </p>
                )}
                {canReview && !item.mergedIntoId && (
                  <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        action(() =>
                          review({
                            action: item.state === "dismissed" ? "reopen" : "dismiss",
                            expectedVersion: item.version,
                          }),
                        )
                      }
                    >
                      {item.state === "dismissed" ? "Reopen" : "Dismiss"}
                    </Button>
                    {item.state === "open" &&
                      items.some(
                        (i) => i.itemId !== item.itemId && i.state === "open",
                      ) && (
                        <>
                          <Select value={mergeTarget} onValueChange={setMergeTarget}>
                            <SelectTrigger aria-label="Merge into" className="w-56">
                              <SelectValue placeholder="Merge into…" />
                            </SelectTrigger>
                            <SelectContent>
                              {items
                                .filter(
                                  (i) => i.itemId !== item.itemId && i.state === "open",
                                )
                                .map((i) => (
                                  <SelectItem key={i.itemId} value={i.itemId}>
                                    {itemLabel(i)}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <Button
                            variant="outline"
                            disabled={busy || !mergeTarget}
                            onClick={() =>
                              action(() =>
                                review({
                                  action: "merge",
                                  expectedVersion: item.version,
                                  targetItemId: mergeTarget,
                                  expectedTargetVersion: items.find(
                                    (i) => i.itemId === mergeTarget,
                                  )!.version,
                                }),
                              )
                            }
                          >
                            Merge evidence
                          </Button>
                        </>
                      )}
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
