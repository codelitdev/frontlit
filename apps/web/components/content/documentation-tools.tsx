"use client";

import { useCallback, useEffect, useEffectEvent, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronRight,
  Columns2,
  ExternalLink,
  FileMinus2,
  Globe2,
  History as HistoryIcon,
  MoreHorizontal,
} from "lucide-react";
import { TextRenderer } from "@frontlit/page-builder/components";
import { themes } from "@frontlit/page-builder/primitives";
import { Button } from "@/components/ui/codelit/button";
import { IconButton } from "@/components/ui/codelit/icon-button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/codelit/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/codelit/dropdown-menu";
import { documentationPanel } from "@/components/content/documentation-panel";
import { Label } from "@/components/ui/codelit/label";
import { toast } from "sonner";
import {
  type DocumentationPage,
  type DocsPublication,
  type DocsRevision,
  getDomainSettings,
  listDocumentationPublications,
  getDocumentationPublication,
  queueDocumentationPublication,
  retryDocumentationPublication,
  unpublishDocumentationPage,
  getDocumentationSettings,
  listDocumentationRevisions,
  getDocumentationRevision,
  validateDocumentationPublication,
} from "@/lib/api";

type Props = {
  tab?: "history" | "publish";
  compact?: boolean;
  historyScope?: "document" | "site";
  actions?: Array<"live" | "history" | "publish">;
  actionLabels?: Partial<Record<"live" | "history" | "publish", string>>;
  docs: DocumentationPage[];
  canPublish: boolean;
  gitOwned?: boolean;
  onChanged: () => void | Promise<void>;
  reviewOpen?: boolean;
  onReviewOpenChange?: (open: boolean) => void;
  onRestoreVersion?: (revision: DocsRevision) => Promise<void>;
};
type Review = {
  input: Parameters<typeof queueDocumentationPublication>[0];
  report: Awaited<ReturnType<typeof validateDocumentationPublication>>;
};

export function liveDocumentationUrl(hostname: string, slug: string): string {
  const local = hostname === "localhost" || hostname.endsWith(".localhost");
  const origin = `${local ? "http" : "https"}://${hostname}${local ? ":3002" : ""}`;
  const route = slug.split("/").map(encodeURIComponent).join("/");
  return `${origin}/docs/${route}`;
}

function VersionView({
  label,
  title,
  slug,
  excerpt,
  content,
  theme,
}: {
  label: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: DocsRevision["content"];
  theme: (typeof themes)[number]["theme"];
}) {
  return (
    <div className="min-w-0 rounded-lg border">
      <div className="border-b px-4 py-3 text-sm font-semibold">{label}</div>
      <article className="max-h-[55dvh] space-y-4 overflow-y-auto p-4">
        <h3 className="text-xl font-semibold">{title}</h3>
        <p className="break-all text-xs text-muted-foreground">/docs/{slug}</p>
        {excerpt && <p className="text-sm text-muted-foreground">{excerpt}</p>}
        <TextRenderer json={content} theme={theme} profile="documentation" />
      </article>
    </div>
  );
}

export function DocumentationTools({
  docs,
  compact = false,
  historyScope = "site",
  actions = ["live", "history", "publish"],
  actionLabels = {},
  canPublish,
  gitOwned = false,
  onChanged,
  reviewOpen,
  onReviewOpenChange,
  onRestoreVersion,
  tab,
}: Props) {
  const {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
  } = documentationPanel(Boolean(tab));
  const [mode, setMode] = useState<"history" | "publish" | "unpublish" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveHost, setLiveHost] = useState<string | null | undefined>(undefined);
  const [revision, setRevision] = useState<DocsRevision | null>(null);
  const [activeRevisionId, setActiveRevisionId] = useState<string | null>(null);
  const [compareVersion, setCompareVersion] = useState(false);
  const [restoreConfirm, setRestoreConfirm] = useState(false);
  const [history, setHistory] = useState<DocsPublication[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [revisions, setRevisions] = useState<
    Omit<DocsRevision, "content" | "markdown">[]
  >([]);
  const [availableHistory, setAvailableHistory] = useState<{
    documentId: string;
    count: number;
  } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [includeSections, setIncludeSections] = useState(true);
  const [hasNavigationChanges, setHasNavigationChanges] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [job, setJob] = useState<DocsPublication | null>(null);
  const [jobAction, setJobAction] = useState<"publish" | "unpublish">("publish");
  const documentHistory = historyScope === "document" && docs.length === 1;
  const historyDocumentId = documentHistory ? docs[0].documentId : null;
  const historyPublishedAt = documentHistory ? docs[0].publishedAt : null;
  const showHistoryAction =
    actions.includes("history") &&
    (!documentHistory ||
      (availableHistory?.documentId === historyDocumentId &&
        (availableHistory.count > 1 || docs[0].status === "published_with_changes")));
  const showUnpublishAction =
    documentHistory &&
    !tab &&
    Boolean(docs[0].publishedAt) &&
    canPublish &&
    !gitOwned &&
    docs[0].source !== "git";
  const historyActionLabel =
    documentHistory && availableHistory?.count === 1
      ? "Compare with published"
      : "Version history";
  const HistoryActionIcon =
    documentHistory && availableHistory?.count === 1 ? Columns2 : HistoryIcon;
  useEffect(() => {
    if (!historyDocumentId) return;
    let active = true;
    listDocumentationRevisions(historyDocumentId)
      .then(({ items }) => {
        if (active)
          setAvailableHistory({ documentId: historyDocumentId, count: items.length });
      })
      .catch(() => {
        if (active) setAvailableHistory({ documentId: historyDocumentId, count: 0 });
      });
    return () => {
      active = false;
    };
  }, [historyDocumentId, historyPublishedAt]);
  const showLiveAction =
    !tab && actions.includes("live") && docs.length === 1 && docs[0].status !== "draft";
  useEffect(() => {
    if (!showLiveAction) return;
    let active = true;
    getDomainSettings()
      .then((settings) => {
        if (!active) return;
        setLiveHost(settings.canonicalHost);
      })
      .catch(() => {
        if (active) setLiveHost(undefined);
      });
    return () => {
      active = false;
    };
  }, [showLiveAction]);
  const key = () => crypto.randomUUID();
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
  const openPublish = useCallback(() => {
    setMode("publish");
    setSelected(docs.filter((d) => d.status !== "published").map((d) => d.documentId));
    setReview(null);
    setError(null);
  }, [docs]);
  useEffect(() => {
    if (reviewOpen) openPublish();
  }, [reviewOpen, openPublish]);
  useEffect(() => {
    if (mode !== "publish") return;
    let active = true;
    getDocumentationSettings()
      .then((settings) => {
        if (active) setHasNavigationChanges(Boolean(settings.navigationPending));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [mode]);
  useEffect(() => {
    if (!job || !["queued", "preparing", "prepared"].includes(job.status)) return;
    const timer = setTimeout(() => {
      getDocumentationPublication(job.publicationId)
        .then((next) => {
          setJob(next);
          if (next.status === "active") {
            toast.success(
              jobAction === "unpublish"
                ? "Page unpublished."
                : "Documentation changes are live.",
            );
            void onChanged();
            setJob(null);
          }
        })
        .catch((e) => {
          setError(e instanceof Error ? e.message : "Status unavailable.");
          setJob((current) => (current ? { ...current } : null));
        });
    }, 1500);
    return () => clearTimeout(timer);
  }, [job, jobAction, onChanged]);
  async function openHistory() {
    setMode("history");
    setRevision(null);
    setCompareVersion(false);
    setRestoreConfirm(false);
    await action(async () => {
      if (documentHistory) {
        const items = (await listDocumentationRevisions(docs[0].documentId)).items;
        setRevisions(items);
        setAvailableHistory({ documentId: docs[0].documentId, count: items.length });
        const settings = await getDocumentationSettings();
        setActiveRevisionId(
          items.find((item) => item.publicationId === settings.activePublicationId)
            ?.revisionId ?? null,
        );
        if (items.length === 1 && docs[0].status === "published_with_changes") {
          setRevision(
            await getDocumentationRevision(items[0].documentId, items[0].revisionId),
          );
          setCompareVersion(true);
        }
      } else {
        const page = await listDocumentationPublications();
        setHistory(page.items);
        setCursor(page.nextCursor);
      }
    });
  }
  const loadTab = useEffectEvent(() => {
    if (tab === "history") void openHistory();
    else if (tab === "publish") openPublish();
  });
  useEffect(() => {
    loadTab();
  }, [tab]);
  async function reviewPublication() {
    await action(async () => {
      const settings = await getDocumentationSettings();
      const input = {
        selected: selected.map((documentId) => ({
          documentId,
          expectedDraftVersion: docs.find((d) => d.documentId === documentId)!
            .draftVersion,
        })),
        removals: [],
        includeSectionChanges: includeSections,
        expectedDocsDraftVersion: settings.draftVersion,
        expectedPublicationId: settings.activePublicationId,
        idempotencyKey: key(),
      };
      const report = await validateDocumentationPublication(
        input.selected,
        [],
        includeSections,
      );
      setReview({ input, report });
    });
  }
  function close() {
    if (!tab) setMode(null);
    onReviewOpenChange?.(false);
    setError(null);
  }
  function toggle(id: string) {
    setReview(null);
    setSelected((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  }
  const theme = themes[0].theme;
  const pendingDocs = docs.filter((doc) => doc.status !== "published");
  const liveDoc = showLiveAction ? docs[0] : null;
  const liveUrl =
    liveDoc && liveHost ? liveDocumentationUrl(liveHost, liveDoc.slug) : null;
  return (
    <div className={tab ? "space-y-4" : "flex items-center gap-1"}>
      {!tab &&
        (compact ? (
          <>
            <div className="hidden items-center gap-1 xl:flex">
              {showLiveAction && liveUrl && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <IconButton asChild size="sm" aria-label="View live page">
                      <a href={liveUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink />
                      </a>
                    </IconButton>
                  </TooltipTrigger>
                  <TooltipContent>View live page</TooltipContent>
                </Tooltip>
              )}
              {showLiveAction && liveHost === null && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <IconButton asChild size="sm" aria-label="Set up site address">
                      <Link href="/website?tab=domain">
                        <Globe2 />
                      </Link>
                    </IconButton>
                  </TooltipTrigger>
                  <TooltipContent>Set up site address</TooltipContent>
                </Tooltip>
              )}
              {showHistoryAction && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <IconButton
                      size="sm"
                      aria-label={historyActionLabel}
                      disabled={busy}
                      onClick={openHistory}
                    >
                      <HistoryActionIcon />
                    </IconButton>
                  </TooltipTrigger>
                  <TooltipContent>{historyActionLabel}</TooltipContent>
                </Tooltip>
              )}
              {showUnpublishAction && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <IconButton
                      size="sm"
                      aria-label="Unpublish document"
                      disabled={busy}
                      onClick={() => setMode("unpublish")}
                    >
                      <FileMinus2 />
                    </IconButton>
                  </TooltipTrigger>
                  <TooltipContent>Unpublish document</TooltipContent>
                </Tooltip>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton
                  size="sm"
                  aria-label="More document actions"
                  className="xl:hidden"
                >
                  <MoreHorizontal />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {showLiveAction && liveUrl && (
                  <DropdownMenuItem asChild>
                    <a href={liveUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink /> View live page
                    </a>
                  </DropdownMenuItem>
                )}
                {showLiveAction && liveHost === null && (
                  <DropdownMenuItem asChild>
                    <Link href="/website?tab=domain">
                      <Globe2 /> Set up site address
                    </Link>
                  </DropdownMenuItem>
                )}
                {showHistoryAction && (
                  <DropdownMenuItem disabled={busy} onSelect={() => void openHistory()}>
                    <HistoryActionIcon /> {historyActionLabel}
                  </DropdownMenuItem>
                )}
                {showUnpublishAction && (
                  <DropdownMenuItem
                    disabled={busy}
                    onSelect={() => setMode("unpublish")}
                  >
                    <FileMinus2 /> Unpublish document
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : (
          <>
            {showLiveAction && liveUrl && (
              <Button variant="outline" size="sm" asChild>
                <a href={liveUrl} target="_blank" rel="noopener noreferrer">
                  {actionLabels.live ?? "View live page"}
                </a>
              </Button>
            )}
            {showLiveAction && liveHost === null && (
              <Button variant="outline" size="sm" asChild>
                <Link href="/website?tab=domain">Set up site address</Link>
              </Button>
            )}
            {showHistoryAction && (
              <Button variant="outline" size="sm" disabled={busy} onClick={openHistory}>
                {actionLabels.history ?? historyActionLabel}
              </Button>
            )}
            {actions.includes("publish") &&
              canPublish &&
              !gitOwned &&
              reviewOpen === undefined && (
                <Button variant="outline" size="sm" onClick={openPublish}>
                  {actionLabels.publish ?? "Review publication"}
                </Button>
              )}
          </>
        ))}
      {job && (
        <span role="status" className="text-sm">
          {job.status === "active"
            ? jobAction === "unpublish"
              ? "Unpublished"
              : "Published"
            : job.status === "failed"
              ? jobAction === "unpublish"
                ? "Unpublish failed"
                : "Publication failed"
              : jobAction === "unpublish"
                ? "Unpublishing…"
                : "Publishing…"}
          {job.status === "failed" && canPublish && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() =>
                action(async () =>
                  setJob(await retryDocumentationPublication(job.publicationId, key())),
                )
              }
            >
              Retry
            </Button>
          )}
        </span>
      )}
      {error && !mode && <p role="alert">{error}</p>}
      <Dialog
        open={mode !== null}
        onOpenChange={(open) => {
          if (!open && !busy) close();
        }}
      >
        <DialogContent
          className={`max-h-[90dvh] overflow-y-auto ${compareVersion && revision ? "sm:max-w-5xl" : "sm:max-w-3xl"}`}
        >
          <DialogHeader>
            <DialogTitle>
              {mode === "history"
                ? documentHistory
                  ? restoreConfirm
                    ? "Restore as draft?"
                    : compareVersion
                      ? "Compare versions"
                      : revision
                        ? "Published version"
                        : "Version history"
                  : "Publication activity"
                : mode === "unpublish"
                  ? "Unpublish this document?"
                  : "Publish changes"}
            </DialogTitle>
            <DialogDescription>
              {mode === "publish"
                ? "Choose the saved changes to make public. Nothing changes on your site until you publish."
                : mode === "unpublish"
                  ? `“${docs[0].title || docs[0].draftTitle}” will be removed from your public docs and search. Its saved draft will remain in FrontLit.`
                  : documentHistory
                    ? restoreConfirm
                      ? "This replaces your saved draft. The public page will not change until you publish."
                      : revision
                        ? compareVersion
                          ? "Compare this published version with your saved, unpublished draft."
                          : "A saved copy of this article as it appeared when published."
                        : "Browse published versions of this article. Viewing a version does not change the live page."
                    : "Recent changes to your documentation site."}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {busy && <p role="status">Working…</p>}
          {mode === "unpublish" && showUnpublishAction && (
            <DialogFooter>
              <Button variant="outline" disabled={busy} onClick={close}>
                Keep published
              </Button>
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    const settings = await getDocumentationSettings();
                    const accepted = await unpublishDocumentationPage(
                      docs[0].documentId,
                      settings.activePublicationId,
                      settings.draftVersion,
                      key(),
                    );
                    setJobAction("unpublish");
                    setJob(accepted);
                    close();
                  })
                }
              >
                Unpublish document
              </Button>
            </DialogFooter>
          )}
          {mode === "publish" && (
            <>
              <div className="space-y-2">
                {pendingDocs.length > 0 && (
                  <h3 className="text-sm font-semibold">Pending pages</h3>
                )}
                {pendingDocs.map((doc) => (
                  <div key={doc.documentId} className="rounded-lg border p-4">
                    <Label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={selected.includes(doc.documentId)}
                        onChange={() => toggle(doc.documentId)}
                        disabled={busy}
                      />
                      <span>
                        <span className="block font-medium">
                          {doc.draftTitle || "Untitled"}
                        </span>
                        <span className="block text-sm font-normal text-muted-foreground">
                          {doc.publishedAt ? "Unpublished edits" : "New page"}
                        </span>
                      </span>
                    </Label>
                    {doc.publishedAt && doc.slug !== doc.draftSlug && (
                      <p className="mt-2 break-all text-sm text-muted-foreground">
                        Address: /docs/{doc.slug} → /docs/{doc.draftSlug}
                      </p>
                    )}
                  </div>
                ))}
                {pendingDocs.length === 0 && (
                  <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    No pages have unpublished edits.
                  </p>
                )}
              </div>
              {hasNavigationChanges && (
                <div className="border-t pt-4">
                  <Label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={includeSections}
                      onChange={(e) => {
                        setIncludeSections(e.target.checked);
                        setReview(null);
                      }}
                    />
                    Include navigation changes
                  </Label>
                </div>
              )}
              {review && (
                <div
                  role="status"
                  className="space-y-2 rounded-lg border bg-muted/30 p-4 text-sm"
                >
                  <p className="font-medium">
                    {review.report.publishable
                      ? "Ready to publish"
                      : "Fix these issues before publishing"}
                  </p>
                  <p className="text-muted-foreground">
                    {review.input.selected?.length} pages selected
                  </p>
                  {review.report.diagnostics.map((d) => (
                    <p
                      key={`${d.documentId ?? ""}:${d.code}:${d.fieldPath ?? ""}:${d.message}`}
                    >
                      {d.message}
                    </p>
                  ))}
                </div>
              )}
              <DialogFooter className="flex-col sm:flex-row [&>button]:w-full sm:[&>button]:w-auto">
                <Button
                  variant="outline"
                  disabled={
                    busy ||
                    (!selected.length && !(includeSections && hasNavigationChanges))
                  }
                  onClick={reviewPublication}
                >
                  Check changes
                </Button>
                <Button
                  disabled={busy || !review?.report.publishable}
                  onClick={() =>
                    action(async () => {
                      const accepted = await queueDocumentationPublication(
                        review!.input,
                      );
                      setJobAction("publish");
                      setJob(accepted);
                      setReview(null);
                      close();
                    })
                  }
                >
                  Publish selected changes
                </Button>
              </DialogFooter>
            </>
          )}
          {mode === "history" && (
            <>
              {documentHistory ? (
                revision ? (
                  restoreConfirm ? (
                    <div className="space-y-5">
                      <p className="text-sm">
                        {revision.title} ·{" "}
                        {new Date(revision.createdAt).toLocaleString()}
                      </p>
                      <DialogFooter>
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() => setRestoreConfirm(false)}
                        >
                          Keep current draft
                        </Button>
                        <Button
                          disabled={busy || !onRestoreVersion}
                          onClick={() =>
                            action(async () => {
                              await onRestoreVersion!(revision);
                              close();
                              toast.success("Version restored as a draft.");
                            })
                          }
                        >
                          Restore version
                        </Button>
                      </DialogFooter>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        {revisions.length > 1 ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setRevision(null);
                              setCompareVersion(false);
                            }}
                          >
                            <ArrowLeft className="size-4" /> Back to versions
                          </Button>
                        ) : (
                          <span />
                        )}
                        <div className="flex flex-wrap gap-2">
                          {docs[0].status === "published_with_changes" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setCompareVersion((value) => !value)}
                            >
                              {compareVersion
                                ? "Show version only"
                                : "Compare with saved draft"}
                            </Button>
                          )}
                          {onRestoreVersion &&
                            docs[0].source !== "git" &&
                            activeRevisionId &&
                            revision.revisionId !== activeRevisionId && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setRestoreConfirm(true)}
                              >
                                Restore as draft
                              </Button>
                            )}
                        </div>
                      </div>
                      {compareVersion ? (
                        <div className="grid gap-3 lg:grid-cols-2">
                          <VersionView
                            label="Published version"
                            title={revision.title}
                            slug={revision.slug}
                            excerpt={revision.excerpt}
                            content={revision.content}
                            theme={theme}
                          />
                          <VersionView
                            label="Saved draft"
                            title={docs[0].draftTitle}
                            slug={docs[0].draftSlug ?? docs[0].slug}
                            excerpt={docs[0].draftExcerpt ?? null}
                            content={docs[0].draftContent}
                            theme={theme}
                          />
                        </div>
                      ) : (
                        <div className="max-h-[60dvh] overflow-y-auto rounded-lg bg-muted/30 p-5 sm:p-8">
                          <article className="mx-auto max-w-2xl space-y-6">
                            <p className="text-sm text-muted-foreground">
                              Version saved{" "}
                              {new Date(revision.createdAt).toLocaleString()}
                            </p>
                            <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                              {revision.title}
                            </h3>
                            <TextRenderer
                              json={revision.content}
                              theme={theme}
                              profile="documentation"
                            />
                          </article>
                        </div>
                      )}
                    </div>
                  )
                ) : (
                  <div className="space-y-2">
                    {!busy && revisions.length === 0 && (
                      <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                        No published versions yet. Publish this article to create its
                        first version.
                      </p>
                    )}
                    {[...revisions]
                      .sort((a, b) =>
                        a.revisionId === activeRevisionId &&
                        b.revisionId !== activeRevisionId
                          ? -1
                          : b.revisionId === activeRevisionId &&
                              a.revisionId !== activeRevisionId
                            ? 1
                            : 0,
                      )
                      .map((item) => (
                        <button
                          key={item.revisionId}
                          type="button"
                          className="flex w-full items-center justify-between gap-4 rounded-lg border p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          disabled={busy}
                          onClick={() =>
                            action(async () =>
                              setRevision(
                                await getDocumentationRevision(
                                  item.documentId,
                                  item.revisionId,
                                ),
                              ),
                            )
                          }
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium">
                              {item.title}
                            </span>
                            <span className="block text-sm text-muted-foreground">
                              {new Date(item.createdAt).toLocaleString()}
                              {item.revisionId === activeRevisionId
                                ? " · Currently published"
                                : ""}
                            </span>
                          </span>
                          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                        </button>
                      ))}
                  </div>
                )
              ) : (
                <div className="space-y-2">
                  {!busy && history.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No publication activity yet.
                    </p>
                  )}
                  {history.map((item) => (
                    <div key={item.publicationId} className="rounded-lg border p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium capitalize">
                          {item.status === "active"
                            ? "Live now"
                            : item.status === "archived"
                              ? "Previous publication"
                              : item.status}
                        </p>
                        <time
                          className="text-sm text-muted-foreground"
                          dateTime={item.activatedAt ?? item.createdAt}
                        >
                          {new Date(
                            item.activatedAt ?? item.createdAt,
                          ).toLocaleString()}
                        </time>
                      </div>
                      {item.diagnostics.map((d) => (
                        <p
                          key={`${d.documentId ?? ""}:${d.code}:${d.fieldPath ?? ""}:${d.message}`}
                          className="mt-2 text-sm text-destructive"
                        >
                          {d.message}
                        </p>
                      ))}
                      {canPublish && item.status === "failed" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-3"
                          disabled={busy}
                          onClick={() =>
                            action(async () => {
                              setJob(
                                await retryDocumentationPublication(
                                  item.publicationId,
                                  key(),
                                ),
                              );
                              close();
                            })
                          }
                        >
                          Retry publication
                        </Button>
                      )}
                    </div>
                  ))}
                  {cursor && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        action(async () => {
                          const page = await listDocumentationPublications(cursor);
                          setHistory((a) => [...a, ...page.items]);
                          setCursor(page.nextCursor);
                        })
                      }
                    >
                      Load older activity
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
