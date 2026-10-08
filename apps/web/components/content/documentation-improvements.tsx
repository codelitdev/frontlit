"use client";
import { useEffect, useEffectEvent, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/codelit/button";
import { Input } from "@/components/ui/codelit/input";
import { Textarea } from "@/components/ui/codelit/textarea";
import { Label } from "@/components/ui/codelit/label";
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
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Documentation improvements</DialogTitle>
            <DialogDescription>
              Review support gaps, approve a redacted correction, then create a private
              draft for normal publication review.
            </DialogDescription>
          </DialogHeader>
          {busy && <p role="status">Working…</p>}
          {error && <p role="alert">{error}</p>}
          <Label>
            State
            <select
              className="ml-2 rounded border p-2"
              value={state}
              disabled={busy}
              onChange={(e) => {
                const next = e.target.value;
                setState(next);
                setItem(null);
                void action(() => load(undefined, next));
              }}
            >
              {["open", "dismissed", "draft_created", "published"].map((value) => (
                <option key={value} value={value}>
                  {value.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </Label>
          <div className="flex flex-wrap gap-2">
            {items.map((row) => (
              <Button
                key={row.itemId}
                variant={item?.itemId === row.itemId ? "primary" : "outline"}
                disabled={busy}
                onClick={() => select(row)}
              >
                {row.approved?.title ??
                  row.reason?.replaceAll("_", " ") ??
                  "Approved artifact"}
                {row.evidenceCount !== undefined
                  ? ` · ${row.evidenceCount} evidence`
                  : ""}
              </Button>
            ))}
          </div>
          {!items.length && !busy && <p>No improvements available in this state.</p>}
          {cursor && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => action(() => load(cursor))}
            >
              Load more
            </Button>
          )}
          {item && (
            <div className="space-y-4 rounded border p-4">
              <p>
                State: {item.state.replaceAll("_", " ")} · version {item.version}
              </p>
              {item.mergedIntoId && <p>Merged into {item.mergedIntoId}</p>}
              {item.evidence && (
                <section aria-label="Authorized support evidence">
                  <h3>Support evidence</h3>
                  {item.evidence.map((e) => (
                    <div className="my-2 rounded border p-3" key={e.evidenceId}>
                      <Link href={`/?ticket=${e.ticketId}`}>Open conversation</Link>
                      <p className="whitespace-pre-wrap">{e.question}</p>
                      <p>{e.trigger.replaceAll("_", " ")}</p>
                    </div>
                  ))}
                </section>
              )}
              {item.approved && (
                <section aria-label="Approved redacted artifact">
                  <h3>Approved documentation text · version {item.approved.version}</h3>
                  <p>{item.approved.title}</p>
                  <p className="whitespace-pre-wrap">{item.approved.description}</p>
                  <pre className="whitespace-pre-wrap break-words text-sm">
                    {item.approved.correction}
                  </pre>
                  <p>No customer-specific details declared by reviewer.</p>
                </section>
              )}
              {canReview && !item.draftDocumentId && !item.mergedIntoId && (
                <section className="space-y-3" aria-label="Approve redacted correction">
                  <p>
                    Use a standalone description and correction. Remove names, account
                    details, internal URLs and transcripts. If facts are uncertain, keep
                    the item open for investigation.
                  </p>
                  <Label htmlFor="improvement-title">Draft title</Label>
                  <Input
                    id="improvement-title"
                    maxLength={200}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                  <Label htmlFor="improvement-description">Redacted description</Label>
                  <Textarea
                    id="improvement-description"
                    maxLength={1000}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                  <Label htmlFor="improvement-correction">
                    Proposed correction (Markdown)
                  </Label>
                  <Textarea
                    id="improvement-correction"
                    maxLength={16000}
                    value={correction}
                    onChange={(e) => setCorrection(e.target.value)}
                  />
                  <Label>
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />{" "}
                    I reviewed this text and it contains no customer-specific details.
                  </Label>
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
                </section>
              )}
              {canReview && !item.mergedIntoId && (
                <div className="flex flex-wrap gap-2">
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
                  {item.state === "open" && (
                    <>
                      <Label>
                        Merge into
                        <select
                          className="ml-2 rounded border p-2"
                          value={mergeTarget}
                          onChange={(e) => setMergeTarget(e.target.value)}
                        >
                          <option value="">Select open item</option>
                          {items
                            .filter(
                              (i) => i.itemId !== item.itemId && i.state === "open",
                            )
                            .map((i) => (
                              <option key={i.itemId} value={i.itemId}>
                                {i.approved?.title ?? i.reason ?? i.itemId}
                              </option>
                            ))}
                        </select>
                      </Label>
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
              {canWrite &&
                item.approved &&
                !item.draftDocumentId &&
                item.state === "open" && (
                  <section className="space-y-3">
                    <Label>
                      Draft target
                      <select
                        className="ml-2 rounded border p-2"
                        value={target}
                        onChange={(e) => setTarget(e.target.value)}
                      >
                        <option value="">Create new document</option>
                        {docs.map((d) => (
                          <option key={d.documentId} value={d.documentId}>
                            {d.draftTitle} · version {d.draftVersion}
                          </option>
                        ))}
                      </select>
                    </Label>
                    {target && (
                      <p>
                        This replaces the selected saved draft with the approved text. A
                        newer draft will block the operation.
                      </p>
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
                  </section>
                )}
              {(receipt || item.draftDocumentId) && (
                <Link
                  href={`/editor/content/documentation/${receipt?.documentId ?? item.draftDocumentId}`}
                >
                  Open linked draft
                </Link>
              )}
              {item.publicationId && (
                <p>
                  Accepted publication: {item.publicationId}. Publication does not
                  assert that the support issue is resolved.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
