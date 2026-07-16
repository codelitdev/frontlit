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

export default function TeamsPage() {
    const [teams, setTeams] = useState<Team[]>([]);
    const [loading, setLoading] = useState(true);
    const [newTeamName, setNewTeamName] = useState("");

    function refresh() {
        return listTeams().then(({ items }) => setTeams(items));
    }

    useEffect(() => {
        refresh().finally(() => setLoading(false));
    }, []);

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        if (!newTeamName.trim()) return;
        await createTeam(newTeamName.trim());
        setNewTeamName("");
        await refresh();
    }

    if (loading) return <p className="text-neutral-500">Loading…</p>;

    return (
        <div className="max-w-2xl space-y-8">
            <div>
                <h1 className="mb-4 text-2xl font-semibold">Teams</h1>
                <form onSubmit={handleCreate} className="flex gap-2">
                    <input
                        value={newTeamName}
                        onChange={(e) => setNewTeamName(e.target.value)}
                        placeholder="New team name"
                        className="flex-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-500"
                    />
                    <button type="submit" className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white">
                        Create team
                    </button>
                </form>
            </div>

            <div className="space-y-4">
                {teams.map((team) => (
                    <TeamCard key={team.teamId} team={team} onChange={refresh} />
                ))}
            </div>
        </div>
    );
}

function TeamCard({ team, onChange }: { team: Team; onChange: () => Promise<void> }) {
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
        if (!confirm(`Delete team "${team.name}"? This cannot be undone.`)) return;
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
        <div className="rounded-lg border border-neutral-200 p-4">
            <form onSubmit={handleRename} className="mb-2 flex items-center gap-2">
                <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="flex-1 rounded-md border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-500"
                />
                <button type="submit" className="rounded-md border border-neutral-300 px-2 py-1 text-xs">
                    Rename
                </button>
                <button type="button" onClick={handleDelete} className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-600">
                    Delete
                </button>
            </form>
            <p className="text-xs text-neutral-400">{team.teamId}</p>

            <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-3 text-xs font-medium text-neutral-600 hover:underline"
            >
                {expanded ? "Hide API keys" : "Manage API keys"}
            </button>

            {expanded && (
                <div className="mt-3 space-y-2 border-t border-neutral-100 pt-3">
                    {createdKey && (
                        <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs">
                            <p className="font-medium">Save this key now — it won&apos;t be shown again:</p>
                            <code className="break-all">{createdKey.key}</code>
                        </div>
                    )}
                    {keys.map((key) => (
                        <div key={key.id} className="flex items-center justify-between text-sm">
                            <span>
                                {key.name || "Unnamed key"} <code className="text-neutral-400">{key.keyPrefix}…</code>
                            </span>
                            <button onClick={() => handleDeleteKey(key.id)} className="text-xs text-red-600 hover:underline">
                                Revoke
                            </button>
                        </div>
                    ))}
                    <form onSubmit={handleCreateKey} className="flex gap-2">
                        <input
                            value={newKeyName}
                            onChange={(e) => setNewKeyName(e.target.value)}
                            placeholder="Key name"
                            className="flex-1 rounded-md border border-neutral-300 px-2 py-1 text-xs outline-none focus:border-neutral-500"
                        />
                        <button type="submit" className="rounded-md border border-neutral-300 px-2 py-1 text-xs">
                            Create key
                        </button>
                    </form>
                </div>
            )}
        </div>
    );
}
