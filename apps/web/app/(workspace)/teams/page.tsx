"use client";

import { useEffect, useState } from "react";
import {
  type ApiKey,
  type CreatedApiKey,
  type TeamMembership,
  createTeam,
  createTeamKey,
  deleteTeam,
  deleteTeamKey,
  listTeamKeys,
  listTeams,
  renameTeam,
} from "@/lib/api";
import { PageHeader } from "@/components/workspace/page-header";
import { Loading } from "@/components/workspace/loading";
import { ScrollablePage } from "@/components/workspace/scrollable-page";
import { DeleteConfirm } from "@/components/workspace/delete-confirm";
import { Button } from "@/components/ui/codelit/button";
import { Input } from "@/components/ui/codelit/input";
import { Card, CardContent } from "@/components/ui/codelit/card";
import { Banner } from "@/components/workspace/banner";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import {
  isRecentAuthRequired,
  RecentAuthDialog,
} from "@/components/workspace/recent-auth-dialog";
import { useSetBreadcrumb } from "@/components/workspace/breadcrumb-context";

export default function AccountPage() {
  useSetBreadcrumb([{ label: "Account" }]);
  const [teams, setTeams] = useState<TeamMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTeamName, setNewTeamName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [selfEmail, setSelfEmail] = useState<string | null>(null);
  const [recentAuthOpen, setRecentAuthOpen] = useState(false);
  const [pendingSensitive, setPendingSensitive] = useState<
    null | (() => Promise<void>)
  >(null);

  function refresh() {
    return listTeams().then(({ items }) => setTeams(items));
  }

  useEffect(() => {
    void fetch("/api/auth/get-session", { cache: "no-store" })
      .then(async (res) =>
        res.ok ? ((await res.json()) as { user?: { email?: string } }) : null,
      )
      .then((session) => setSelfEmail(session?.user?.email ?? null));
    refresh().finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const team = await createTeam(newTeamName.trim());
      setNewTeamName("");
      void refresh();

      // Mirror SendLit's team flow: after adding a workspace, make it
      // the active scope before returning to the teams page.
      const form = document.createElement("form");
      form.method = "POST";
      form.action = "/api/team/switch";
      for (const [name, value] of Object.entries({
        teamId: team.teamId,
        redirectTo: "/teams",
      })) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = value;
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : "Failed to create team");
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <ScrollablePage>
        <Loading />
      </ScrollablePage>
    );
  }

  return (
    <ScrollablePage>
      <div className="max-w-2xl space-y-8">
        <PageHeader
          title={teams.length === 0 ? "Create or join a team" : "Account"}
          description={
            teams.length === 0
              ? "Create a workspace, or open a team invitation from your email."
              : "Manage your team workspaces and their API keys."
          }
        />

        {teams.length === 0 ? (
          <Card>
            <CardContent className="space-y-5">
              <div className="space-y-1">
                <h2 className="font-medium">Create a team</h2>
                <p className="text-sm text-muted-foreground">
                  A team contains its own website, content, members, and integrations.
                  You will become its owner.
                </p>
              </div>
              <form onSubmit={handleCreate} className="flex gap-2">
                <Input
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="Team name"
                  className="flex-1"
                  autoFocus
                />
                <Button type="submit" disabled={!newTeamName.trim() || creating}>
                  {creating ? "Creating…" : "Create team"}
                </Button>
              </form>
              <p className="border-t pt-4 text-sm text-muted-foreground">
                Already invited? Open the invitation link sent to your email. FrontLit
                will add this account to that team after you accept it.
              </p>
            </CardContent>
          </Card>
        ) : (
          <form onSubmit={handleCreate} className="flex gap-2">
            <Input
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              placeholder="New team name"
              className="flex-1"
            />
            <Button type="submit" disabled={!newTeamName.trim() || creating}>
              {creating ? "Creating…" : "Create team"}
            </Button>
          </form>
        )}
        {createError && <Banner>{createError}</Banner>}

        <div className="space-y-4">
          {teams.map((team) => (
            <TeamCard
              key={team.teamId}
              team={team}
              onChange={refresh}
              onRecentAuthRequired={(run) => {
                setPendingSensitive(() => run);
                setRecentAuthOpen(true);
              }}
            />
          ))}
        </div>
      </div>
      <RecentAuthDialog
        open={recentAuthOpen}
        email={selfEmail}
        onOpenChange={setRecentAuthOpen}
        onVerified={async () => {
          const run = pendingSensitive;
          setPendingSensitive(null);
          if (!run) return;
          try {
            await run();
          } catch (err) {
            toast.error(
              err instanceof ApiError
                ? err.message
                : "Could not finish after verification",
            );
          }
        }}
      />
    </ScrollablePage>
  );
}

function TeamCard({
  team,
  onChange,
  onRecentAuthRequired,
}: {
  team: TeamMembership;
  onChange: () => Promise<void>;
  onRecentAuthRequired: (run: () => Promise<void>) => void;
}) {
  const [name, setName] = useState(team.name);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<CreatedApiKey | null>(null);
  const [expanded, setExpanded] = useState(false);
  const canUpdate = team.isOwner || team.effectivePermissions.includes("team:update");
  const canManageKeys = team.isOwner;

  async function refreshKeys() {
    try {
      const { items } = await listTeamKeys(team.teamId);
      setKeys(items);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not load API keys");
    }
  }

  useEffect(() => {
    if (expanded) void refreshKeys();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    if (!canUpdate || !name.trim() || name.trim() === team.name) return;
    try {
      await renameTeam(team.teamId, name.trim());
      await onChange();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not rename team");
    }
  }

  async function handleDelete() {
    const run = async () => {
      await deleteTeam(team.teamId);
      await onChange();
    };
    try {
      await run();
    } catch (err) {
      if (isRecentAuthRequired(err)) {
        onRecentAuthRequired(run);
        return;
      }
      toast.error(err instanceof ApiError ? err.message : "Could not delete team");
    }
  }

  async function handleCreateKey(e: React.FormEvent) {
    e.preventDefault();
    if (!canManageKeys || !newKeyName.trim()) return;
    try {
      const key = await createTeamKey(team.teamId, newKeyName.trim());
      setCreatedKey(key);
      setNewKeyName("");
      await refreshKeys();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not create API key");
    }
  }

  async function handleDeleteKey(keyId: string) {
    if (!canManageKeys) return;
    try {
      await deleteTeamKey(team.teamId, keyId);
      await refreshKeys();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not revoke API key");
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3">
        {canUpdate ? (
          <form onSubmit={handleRename} className="flex items-center gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label={`Name for ${team.name}`}
              className="flex-1"
            />
            <Button type="submit" variant="outline" size="sm">
              Rename
            </Button>
            {team.isOwner && (
              <DeleteConfirm
                title="Delete team?"
                description={`Delete team "${team.name}"? This cannot be undone.`}
                onConfirm={handleDelete}
                trigger={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    Delete
                  </Button>
                }
              />
            )}
          </form>
        ) : (
          <p className="font-medium">{team.name}</p>
        )}
        <p className="text-xs text-muted-foreground">{team.teamId}</p>

        {canManageKeys && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto p-0 text-xs underline underline-offset-4"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Hide API keys" : "Manage API keys"}
          </Button>
        )}

        {canManageKeys && expanded && (
          <div className="space-y-2 border-t pt-3">
            <p className="text-xs text-muted-foreground">
              Each API key has full-team authority. Only the owner can create or revoke
              keys.
            </p>
            {createdKey && (
              <div className="rounded-md border border-warning/30 bg-warning-soft p-2 text-xs">
                <p className="font-medium">
                  Save this key now — it won&apos;t be shown again:
                </p>
                <code className="break-all">{createdKey.key}</code>
              </div>
            )}
            {keys.map((key) => (
              <div key={key.id} className="flex items-center justify-between text-sm">
                <span>
                  {key.name || "Unnamed key"}{" "}
                  <code className="text-muted-foreground">{key.keyPrefix}…</code>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto p-0 text-xs underline underline-offset-4 text-destructive"
                  onClick={() => handleDeleteKey(key.id)}
                >
                  Revoke
                </Button>
              </div>
            ))}
            <form onSubmit={handleCreateKey} className="flex gap-2">
              <Input
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="Key name"
                className="h-8 flex-1 text-xs"
              />
              <Button type="submit" variant="outline" size="sm">
                Create key
              </Button>
            </form>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
