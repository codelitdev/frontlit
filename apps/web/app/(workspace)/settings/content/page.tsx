"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSetBreadcrumb } from "@/components/workspace/breadcrumb-context";
import { ScrollablePage } from "@/components/workspace/scrollable-page";
import { PageHeader } from "@/components/workspace/page-header";
import { useWorkspaceAccess } from "@/components/workspace/workspace-access";
import { Badge } from "@/components/ui/codelit/badge";
import { Button } from "@/components/ui/codelit/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/codelit/card";
import { DocumentationImprovements } from "@/components/content/documentation-improvements";
import { DocumentationRetrievalSettings } from "@/components/content/documentation-retrieval-settings";
import { DocumentationSource } from "@/components/content/documentation-source";
import { DocumentationTools } from "@/components/content/documentation-tools";
import {
  getDocumentationSettings,
  listAllDocumentationPages,
  listDocumentationSections,
  type DocumentationPage,
} from "@/lib/api";

export default function ContentSettingsPage() {
  useSetBreadcrumb([{ label: "Settings" }, { label: "Content" }]);
  const { currentTeam } = useWorkspaceAccess();
  const [docs, setDocs] = useState<DocumentationPage[]>([]);
  const [hasCmsContent, setHasCmsContent] = useState(false);
  const [source, setSource] = useState<"editor" | "git">("editor");
  const [activePublicationId, setActivePublicationId] = useState<string | null>(null);
  const [navigationPending, setNavigationPending] = useState(false);
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
    setLoading(true);
    setError(null);
    void refresh()
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Unable to load content settings."),
      )
      .finally(() => setLoading(false));
  }, [currentTeam?.teamId, canRead, refresh]);

  const publishedCount = docs.filter((doc) => Boolean(doc.publishedAt)).length;
  const draftCount = docs.filter((doc) => doc.status !== "published").length;
  const searchLabel = !indexing.enabled
    ? "Search disabled"
    : `${indexing.mode === "semantic" ? "Semantic" : "Lexical"} search`;
  const docsSummary = docs.length
    ? `${publishedCount} published ${publishedCount === 1 ? "page" : "pages"}${draftCount ? ` · ${draftCount} ${draftCount === 1 ? "page" : "pages"} pending publication` : ""}`
    : "No pages yet";

  return (
    <ScrollablePage>
      <div className="mx-auto w-full max-w-5xl space-y-6 p-6" key={currentTeam?.teamId}>
        <PageHeader
          title="Documentation"
          description="Manage what readers can find and how updates go live."
          action={
            canWrite ? (
              <Button asChild>
                <Link href="/content?type=documentation">Manage docs</Link>
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
              <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">Your documentation</p>
                  <p className="text-sm text-muted-foreground">
                    {source === "git" ? "Managed in GitHub" : "Managed in FrontLit"}
                    {" · "}
                    {docsSummary}
                  </p>
                </div>
                <Badge variant={activePublicationId ? "success" : "neutral"} dot>
                  {activePublicationId ? "Publication active" : "Nothing published yet"}
                </Badge>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Publishing</CardTitle>
                  <CardDescription>
                    {source === "git"
                      ? "Changes from GitHub are validated before they go live. Manage sync from your source settings."
                      : draftCount
                        ? `${draftCount} ${draftCount === 1 ? "page has" : "pages have"} unpublished changes${navigationPending ? "; navigation also has changes" : ""}.`
                        : navigationPending
                          ? "Navigation has unpublished changes."
                          : hasCmsContent
                            ? "Your current docs are published. New edits stay private until you review them."
                            : "Create your first documentation page in the workspace to get started."}
                  </CardDescription>
                </CardHeader>
                <CardFooter className="flex-wrap">
                  {canPublish &&
                    source !== "git" &&
                    (draftCount > 0 || navigationPending) && (
                      <DocumentationTools
                        actions={["publish"]}
                        actionLabels={{ publish: "Review pending changes" }}
                        docs={docs}
                        canPublish={canPublish}
                        gitOwned={false}
                        onChanged={refresh}
                      />
                    )}
                </CardFooter>
              </Card>

              {canManage && currentTeam && (
                <Card>
                  <CardHeader>
                    <CardTitle>Content source</CardTitle>
                    <CardDescription>
                      {source === "git"
                        ? "Documentation is managed from GitHub. Check its connection and sync status here."
                        : "Your docs are managed in FrontLit. Connect GitHub if your team prefers pull request reviews."}
                    </CardDescription>
                  </CardHeader>
                  <CardFooter>
                    <DocumentationSource
                      workspaceKey={currentTeam.teamId}
                      hasCmsContent={hasCmsContent}
                      canPublish={canPublish}
                      onChanged={refresh}
                      triggerLabel="Manage source"
                    />
                  </CardFooter>
                </Card>
              )}

              {canManage && (
                <Card>
                  <CardHeader>
                    <CardTitle>Search and answers</CardTitle>
                    <CardDescription>
                      Choose how published documentation is searched for readers and
                      grounded answers.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <Badge variant={indexing.enabled ? "neutral" : "warning"}>
                      {searchLabel}
                    </Badge>
                  </CardContent>
                  <CardFooter>
                    <DocumentationRetrievalSettings
                      onChanged={refresh}
                      triggerLabel="Configure search"
                    />
                  </CardFooter>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle>Documentation gaps</CardTitle>
                  <CardDescription>
                    Review unanswered questions and recurring support issues. Approved
                    corrections become drafts.
                  </CardDescription>
                </CardHeader>
                <CardFooter>
                  <DocumentationImprovements
                    docs={docs}
                    onChanged={refresh}
                    triggerLabel="Review gaps"
                  />
                </CardFooter>
              </Card>
            </div>
          </>
        )}
      </div>
    </ScrollablePage>
  );
}
