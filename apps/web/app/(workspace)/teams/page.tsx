"use client";

import { useEffect, useState } from "react";
import {
    type ApiKey,
    type CreatedApiKey,
    type Team,
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
import { ApiError } from "@/lib/api-client";
import { useSetBreadcrumb } from "@/components/workspace/breadcrumb-context";

export default function AccountPage() {
    useSetBreadcrumb([{ label: "Account" }]);
    const [teams, setTeams] = useState<Team[]>([]);
    const [loading, setLoading] = useState(true);
    const [newTeamName, setNewTeamName] = useState("");
    const [createError, setCreateError] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);

    function refresh() {
        return listTeams().then(({ items }) => setTeams(items));
    }

    useEffect(() => {
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
            setCreateError(
                err instanceof ApiError ? err.message : "Failed to create team",
            );
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
                    title="Account"
                    description="Manage your team workspaces and their API keys."
                />

                <form onSubmit={handleCreate} className="flex gap-2">
                    <Input
                        value={newTeamName}
                        onChange={(e) => setNewTeamName(e.target.value)}
                        placeholder="New team name"
                        className="flex-1"
                    />
                    <Button
                        type="submit"
                        disabled={!newTeamName.trim() || creating}
                    >
                        {creating ? "Creating…" : "Create team"}
                    </Button>
                </form>
                {createError && <Banner>{createError}</Banner>}

                <div className="space-y-4">
                    {teams.map((team) => (
                        <TeamCard
                            key={team.teamId}
                            team={team}
                            onChange={refresh}
                        />
                    ))}
                </div>
            </div>
        </ScrollablePage>
    );
}

function TeamCard({
    team,
    onChange,
}: {
    team: Team;
    onChange: () => Promise<void>;
}) {
    const [name, setName] = useState(team.name);
    const [keys, setKeys] = useState<ApiKey[]>([]);
    const [newKeyName, setNewKeyName] = useState("");
    const [createdKey, setCreatedKey] = useState<CreatedApiKey | null>(null);
    const [expanded, setExpanded] = useState(false);

    function refreshKeys() {
        return listTeamKeys(team.teamId).then(({ items }) => setKeys(items));
    }

    useEffect(() => {
        if (expanded) refreshKeys();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [expanded]);

    async function handleRename(e: React.FormEvent) {
        e.preventDefault();
        if (name.trim() && name.trim() !== team.name) {
            await renameTeam(team.teamId, name.trim());
            await onChange();
        }
    }

    async function handleDelete() {
        await deleteTeam(team.teamId);
        await onChange();
    }

    async function handleCreateKey(e: React.FormEvent) {
        e.preventDefault();
        if (!newKeyName.trim()) return;
        const key = await createTeamKey(team.teamId, newKeyName.trim());
        setCreatedKey(key);
        setNewKeyName("");
        await refreshKeys();
    }

    async function handleDeleteKey(keyId: string) {
        await deleteTeamKey(team.teamId, keyId);
        await refreshKeys();
    }

    return (
        <Card>
            <CardContent className="space-y-3">
                <form
                    onSubmit={handleRename}
                    className="flex items-center gap-2"
                >
                    <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="flex-1"
                    />
                    <Button type="submit" variant="outline" size="sm">
                        Rename
                    </Button>
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
                </form>
                <p className="text-xs text-muted-foreground">{team.teamId}</p>

                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 text-xs underline underline-offset-4"
                    onClick={() => setExpanded((v) => !v)}
                >
                    {expanded ? "Hide API keys" : "Manage API keys"}
                </Button>

                {expanded && (
                    <div className="space-y-2 border-t pt-3">
                        {createdKey && (
                            <div className="rounded-md border border-warning/30 bg-warning-soft p-2 text-xs">
                                <p className="font-medium">
                                    Save this key now — it won&apos;t be shown
                                    again:
                                </p>
                                <code className="break-all">
                                    {createdKey.key}
                                </code>
                            </div>
                        )}
                        {keys.map((key) => (
                            <div
                                key={key.id}
                                className="flex items-center justify-between text-sm"
                            >
                                <span>
                                    {key.name || "Unnamed key"}{" "}
                                    <code className="text-muted-foreground">
                                        {key.keyPrefix}…
                                    </code>
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
