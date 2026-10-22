"use client";

import { useCallback, useEffect, useState } from "react";
import { Github } from "lucide-react";
import { useSetBreadcrumb } from "@/components/workspace/breadcrumb-context";
import { ScrollablePage } from "@/components/workspace/scrollable-page";
import { PageHeader } from "@/components/workspace/page-header";
import { SettingRow } from "@/components/workspace/setting-row";
import { useWorkspaceAccess } from "@/components/workspace/workspace-access";
import { Card } from "@/components/ui/codelit/card";
import { DocumentationSource } from "@/components/content/documentation-source";
import {
  getDocumentationGitSource,
  listAllDocumentationPages,
  listDocumentationSections,
} from "@/lib/api";

export default function IntegrationsSettingsPage() {
  useSetBreadcrumb([{ label: "Settings" }, { label: "Integrations" }]);
  const { currentTeam } = useWorkspaceAccess();
  const [hasCmsContent, setHasCmsContent] = useState(false);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const permissions = currentTeam?.effectivePermissions ?? [];
  const canManage = Boolean(
    currentTeam?.isOwner || permissions.includes("documentation:manage"),
  );
  const canPublish = Boolean(
    currentTeam?.isOwner || permissions.includes("documentation:publish"),
  );

  const refresh = useCallback(async () => {
    const [pages, sections, git] = await Promise.all([
      listAllDocumentationPages(),
      listDocumentationSections(),
      getDocumentationGitSource(),
    ]);
    setHasCmsContent(Boolean(pages.length || sections.items.length));
    // Docs, pages or both can be connected; docs may still live in FrontLit.
    setConnected(Boolean(git.binding) && git.status !== "disconnected");
  }, []);

  useEffect(() => {
    if (!canManage) return;
    setLoading(true);
    setError(null);
    void refresh()
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Unable to load integrations."),
      )
      .finally(() => setLoading(false));
  }, [currentTeam?.teamId, canManage, refresh]);

  return (
    <ScrollablePage>
      <div className="mx-auto w-full max-w-5xl space-y-6 p-6" key={currentTeam?.teamId}>
        <PageHeader
          title="Integrations"
          description="Connect outside services to your workspace."
        />
        {!canManage ? (
          <p>You do not have permission to manage integrations.</p>
        ) : error ? (
          <p role="alert">{error}</p>
        ) : loading ? (
          <p role="status">Loading integrations…</p>
        ) : (
          currentTeam && (
            <Card className="divide-y overflow-clip">
              <SettingRow
                icon={<Github />}
                title="GitHub"
                badge={connected ? "Connected" : "Not connected"}
                description={
                  connected
                    ? "Your docs or pages are managed in a GitHub repository. Check the connection and sync status here."
                    : "Keep your docs and landing pages in a GitHub repository and review changes through pull requests."
                }
              >
                <DocumentationSource
                  workspaceKey={currentTeam.teamId}
                  hasCmsContent={hasCmsContent}
                  canPublish={canPublish}
                  onChanged={refresh}
                  triggerLabel={connected ? "Manage" : "Connect GitHub"}
                />
              </SettingRow>
            </Card>
          )
        )}
      </div>
    </ScrollablePage>
  );
}
