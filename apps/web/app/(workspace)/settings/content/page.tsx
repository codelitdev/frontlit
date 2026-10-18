"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  CircleAlert,
  CircleHelp,
  ExternalLink,
  FileText,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useSetBreadcrumb } from "@/components/workspace/breadcrumb-context";
import { ScrollablePage } from "@/components/workspace/scrollable-page";
import { PageHeader } from "@/components/workspace/page-header";
import { SettingRow } from "@/components/workspace/setting-row";
import { useWorkspaceAccess } from "@/components/workspace/workspace-access";
import { Badge } from "@/components/ui/codelit/badge";
import { Button } from "@/components/ui/codelit/button";
import { Card, CardContent } from "@/components/ui/codelit/card";
import { DocumentationImprovements } from "@/components/content/documentation-improvements";
import { DocumentationRetrievalSettings } from "@/components/content/documentation-retrieval-settings";
import {
  DocumentationTools,
  liveDocumentationUrl,
} from "@/components/content/documentation-tools";
import {
  getDomainSettings,
  getDocumentationSettings,
  listAllDocumentationPages,
  listDocumentationSections,
  type DocumentationPage,
} from "@/lib/api";

function relativeTime(value: string | null) {
  if (!value) return "";
  const minutes = Math.floor(
    Math.max(0, Date.now() - new Date(value).getTime()) / 60_000,
  );
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `on ${new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

export default function ContentSettingsPage() {
  useSetBreadcrumb([{ label: "Settings" }, { label: "Content" }]);
  const { currentTeam } = useWorkspaceAccess();
  const [docs, setDocs] = useState<DocumentationPage[]>([]);
  const [hasCmsContent, setHasCmsContent] = useState(false);
  const [source, setSource] = useState<"editor" | "git">("editor");
  const [activePublicationId, setActivePublicationId] = useState<string | null>(null);
  const [navigationPending, setNavigationPending] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  // undefined until loaded, null when the site has no public address yet.
  const [liveHost, setLiveHost] = useState<string | null | undefined>(undefined);
  const [indexing, setIndexing] = useState<{
    enabled: boolean;
    mode?: "lexical" | "semantic";
  }>({ enabled: true, mode: "lexical" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const permissions = currentTeam?.effectivePermissions ?? [];
  const canRead = Boolean(
    currentTeam?.isOwner || permissions.includes("documentation:read"),
  );
  const canManage = Boolean(
    currentTeam?.isOwner || permissions.includes("documentation:manage"),
  );
  const canPublish = Boolean(
    currentTeam?.isOwner || permissions.includes("documentation:publish"),
  );
  const canWrite = Boolean(
    currentTeam?.isOwner || permissions.includes("documentation:write"),
  );

  const refresh = useCallback(async () => {
    const [pages, sections, settings] = await Promise.all([
      listAllDocumentationPages(),
      listDocumentationSections(),
      getDocumentationSettings(),
    ]);
    setDocs(pages);
    setHasCmsContent(Boolean(pages.length || sections.items.length));
    setSource(settings.source);
    setActivePublicationId(settings.activePublicationId);
    setNavigationPending(Boolean(settings.navigationPending));
    setIndexing(settings.indexing);
  }, []);

  useEffect(() => {
    if (!canRead) return;
    void getDomainSettings()
      .then((domain) => setLiveHost(domain.canonicalHost))
      .catch(() => setLiveHost(undefined));
    setLoading(true);
    setError(null);
    void refresh()
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Unable to load content settings."),
      )
      .finally(() => setLoading(false));
  }, [currentTeam?.teamId, canRead, refresh]);

  const publishedCount = docs.filter((doc) => Boolean(doc.publishedAt)).length;
  const pendingDocs = docs.filter((doc) => doc.status !== "published");
  const waitingCount = pendingDocs.length + (navigationPending ? 1 : 0);
  const searchLabel = !indexing.enabled
    ? "Search off"
    : indexing.mode === "semantic"
      ? "Semantic search"
      : "Keyword search";
  const gitOwned = source === "git";

  return (
    <ScrollablePage>
      <div className="mx-auto w-full max-w-5xl space-y-6 p-6" key={currentTeam?.teamId}>
        <PageHeader
          title="Documentation"
          description="Where your docs come from, how they go live and how readers find answers."
          action={
            canWrite ? (
              <Button asChild variant="outline">
                <Link href="/content?type=documentation">
                  Open docs
                  <ArrowRight />
                </Link>
              </Button>
            ) : undefined
          }
        />
        {!canRead ? (
          <p>You do not have permission to view documentation settings.</p>
        ) : error ? (
          <p role="alert">{error}</p>
        ) : loading ? (
          <p role="status">Loading documentation settings…</p>
        ) : (
          <>
            <Card>
              <CardContent className="space-y-4 p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-lg font-semibold">Publication</h2>
                      <Badge variant={activePublicationId ? "success" : "neutral"} dot>
                        {activePublicationId ? "Live" : "Not live yet"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {publishedCount
                        ? `${publishedCount} ${publishedCount === 1 ? "page is" : "pages are"} live for readers.`
                        : hasCmsContent
                          ? "Nothing is live for readers yet."
                          : "Create your first documentation page to get started."}
                    </p>
                  </div>
                  {liveHost && (
                    <Button asChild variant="ghost" size="sm" className="shrink-0">
                      <a
                        href={liveDocumentationUrl(liveHost, "")}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View live docs
                        <ExternalLink />
                      </a>
                    </Button>
                  )}
                  {liveHost === null && activePublicationId && (
                    <Button asChild variant="ghost" size="sm" className="shrink-0">
                      <Link href="/website?tab=domain">Set up site address</Link>
                    </Button>
                  )}
                </div>
                {gitOwned && (
                  <p className="rounded-[0.625rem] bg-muted px-4 py-3 text-sm text-muted-foreground">
                    Changes merged in GitHub are checked, then go live automatically.
                  </p>
                )}
                {!gitOwned && waitingCount > 0 && (
                  <div className="overflow-hidden rounded-[0.625rem] border">
                    <div className="space-y-3 bg-[var(--warning-soft)] px-4 py-3.5">
                      <p className="flex flex-wrap items-start gap-x-2 gap-y-1 text-sm">
                        <CircleAlert className="mt-0.5 size-4 shrink-0 text-[var(--warning)]" />
                        <b className="font-semibold">
                          {waitingCount} {waitingCount === 1 ? "change" : "changes"}{" "}
                          waiting to publish
                        </b>
                        <span className="text-muted-foreground">
                          Readers still see the previous version.
                        </span>
                      </p>
                      {canPublish && (
                        <Button size="sm" onClick={() => setReviewOpen(true)}>
                          Publish
                        </Button>
                      )}
                    </div>
                    {pendingDocs.slice(0, 5).map((doc) => (
                      <div
                        key={doc.documentId}
                        className="flex items-center gap-3 border-t px-4 py-3"
                      >
                        <FileText className="size-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {doc.draftTitle || "Untitled doc"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {doc.status === "published_with_changes"
                              ? "Edited"
                              : "New draft · edited"}{" "}
                            {relativeTime(doc.updatedAt)}
                          </p>
                        </div>
                        {doc.status === "published_with_changes" ? (
                          <DocumentationTools
                            actions={["history"]}
                            actionLabels={{ history: "Review changes" }}
                            historyScope="document"
                            docs={[doc]}
                            canPublish={canPublish}
                            onChanged={refresh}
                          />
                        ) : (
                          <Button asChild variant="outline" size="sm">
                            <Link
                              href={`/editor/content/documentation/${doc.documentId}`}
                            >
                              Open draft
                            </Link>
                          </Button>
                        )}
                      </div>
                    ))}
                    {pendingDocs.length > 5 && (
                      <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
                        and {pendingDocs.length - 5} more. Publish shows them all.
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
            {canPublish && !gitOwned && (
              <DocumentationTools
                actions={["publish"]}
                docs={docs}
                canPublish={canPublish}
                gitOwned={false}
                onChanged={refresh}
                reviewOpen={reviewOpen}
                onReviewOpenChange={setReviewOpen}
              />
            )}

            <div className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground">Settings</h2>
              <Card className="divide-y overflow-clip">
                {canManage && (
                  <SettingRow
                    icon={<Search />}
                    title="Search and answers"
                    badge={searchLabel}
                    description="Choose how readers search your published docs and how answers are grounded in them."
                  >
                    <DocumentationRetrievalSettings
                      onChanged={refresh}
                      triggerLabel="Configure"
                    />
                  </SettingRow>
                )}
                <SettingRow
                  icon={<CircleHelp />}
                  title="Documentation gaps"
                  description="Questions readers asked that your docs couldn't answer, plus recurring support issues. Approve a fix and it becomes a draft."
                >
                  <DocumentationImprovements
                    docs={docs}
                    onChanged={refresh}
                    triggerLabel="Review gaps"
                  />
                </SettingRow>
              </Card>
            </div>
          </>
        )}
      </div>
    </ScrollablePage>
  );
}
