"use client";

import { useCallback, useEffect, useState } from "react";
import { GitCommit, MousePointerClick } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { activateSiteRelease, listSiteReleases, type SiteRelease } from "@/lib/api";
import { Loading } from "@/components/workspace/loading";
import { PageHeader } from "@/components/workspace/page-header";
import { ScrollablePage } from "@/components/workspace/scrollable-page";
import { DeleteConfirm } from "@/components/workspace/delete-confirm";
import { useSetBreadcrumb } from "@/components/workspace/breadcrumb-context";
import { useWorkspaceAccess } from "@/components/workspace/workspace-access";
import { Badge } from "@/components/ui/codelit/badge";
import { Button } from "@/components/ui/codelit/button";
import { Card, CardContent } from "@/components/ui/codelit/card";

/** Every publish (builder or Git) creates a release; activating an older
 * one rolls the public site back without touching drafts. */
export default function ReleasesPage() {
  useSetBreadcrumb([
    { label: "Website", href: "/website?tab=pages" },
    { label: "Releases" },
  ]);
  const { currentTeam } = useWorkspaceAccess();
  const canWrite = Boolean(
    currentTeam?.isOwner || currentTeam?.effectivePermissions.includes("pages:write"),
  );
  const [releases, setReleases] = useState<SiteRelease[] | null>(null);
  const [confirming, setConfirming] = useState<SiteRelease | null>(null);

  const load = useCallback(() => {
    listSiteReleases()
      .then(({ items }) => setReleases(items))
      .catch(() => setReleases([]));
  }, []);
  useEffect(load, [load]);

  async function activate(release: SiteRelease) {
    try {
      await activateSiteRelease(release.releaseId);
      toast.success("Release is live");
      load();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Couldn't activate release",
      );
    }
  }

  if (!releases) {
    return (
      <ScrollablePage>
        <Loading />
      </ScrollablePage>
    );
  }

  return (
    <ScrollablePage>
      <div className="max-w-3xl">
        <PageHeader
          title="Releases"
          description="Each publish creates a release: a snapshot of every live page plus the site header and footer. Activate an older release to roll the site back. Drafts aren't affected."
        />
        {releases.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing has been published yet.
          </p>
        ) : (
          <Card>
            <CardContent className="divide-y p-0">
              {releases.map((release) => (
                <div
                  key={release.releaseId}
                  className="flex items-center gap-4 px-4 py-3"
                  data-testid="site-release"
                >
                  <div className="text-muted-foreground">
                    {release.source === "git" ? (
                      <GitCommit className="size-4" aria-label="From Git" />
                    ) : (
                      <MousePointerClick
                        className="size-4"
                        aria-label="From the builder"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {release.summary ?? "Release"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(release.createdAt).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}{" "}
                      ·{" "}
                      {release.pageCount === 1
                        ? "1 page"
                        : `${release.pageCount} pages`}
                      {release.commitSha && (
                        <>
                          {" · "}
                          <code>{release.commitSha.slice(0, 7)}</code>
                        </>
                      )}
                    </p>
                  </div>
                  {release.active ? (
                    <Badge variant="success" dot>
                      Live
                    </Badge>
                  ) : (
                    canWrite && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirming(release)}
                      >
                        Activate
                      </Button>
                    )
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
      <DeleteConfirm
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        trigger={null}
        title="Activate this release?"
        description="The public site switches to this release's pages, header and footer right away. Drafts stay as they are."
        confirmLabel="Activate"
        onConfirm={async () => {
          if (confirming) await activate(confirming);
          setConfirming(null);
        }}
      />
    </ScrollablePage>
  );
}
