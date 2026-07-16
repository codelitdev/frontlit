"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/api-client";
import {
    connectGithubIntegration,
    createChangelogEntry,
    deleteChangelogEntry,
    disconnectGithubIntegration,
    getGithubIntegration,
    importGithubReleases,
    listChangelogEntries,
    type ChangelogEntry,
    type GithubIntegration,
} from "@/lib/api";

const STATUS_LABEL: Record<ChangelogEntry["status"], string> = {
    draft: "Draft",
    published: "Published",
    published_with_changes: "Published · changes",
};

const STATUS_CLASS: Record<ChangelogEntry["status"], string> = {
    draft: "bg-neutral-200 text-neutral-700",
    published: "bg-emerald-100 text-emerald-700",
    published_with_changes: "bg-amber-100 text-amber-700",
};

export default function ChangelogListPage() {
    const [entries, setEntries] = useState<ChangelogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [newTitle, setNewTitle] = useState("");
    const [github, setGithub] = useState<GithubIntegration | null>(null);
    const [repo, setRepo] = useState("");
    const [token, setToken] = useState("");
    const [connecting, setConnecting] = useState(false);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<string | null>(null);

    function refresh() {
        return listChangelogEntries().then(({ items }) => setEntries(items));
    }

    function refreshGithub() {
        return getGithubIntegration().then(setGithub);
    }

    useEffect(() => {
        Promise.all([refresh(), refreshGithub()]).finally(() => setLoading(false));
    }, []);

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        if (!newTitle.trim()) return;
        await createChangelogEntry({ title: newTitle.trim() });
        setNewTitle("");
        await refresh();
    }

    async function handleDelete(documentId: string) {
        if (!confirm("Delete this changelog entry?")) return;
        try {
            await deleteChangelogEntry(documentId);
            await refresh();
        } catch (err) {
            alert(err instanceof ApiError ? err.message : "Failed to delete entry.");
        }
    }

    async function handleConnectGithub(e: React.FormEvent) {
        e.preventDefault();
        if (!repo.trim() || !token.trim()) return;
        setConnecting(true);
        try {
            setGithub(await connectGithubIntegration({ repo: repo.trim(), token: token.trim() }));
            setRepo("");
            setToken("");
        } catch (err) {
            alert(err instanceof ApiError ? err.message : "Failed to connect GitHub.");
        } finally {
            setConnecting(false);
        }
    }

    async function handleDisconnectGithub() {
        if (!confirm("Disconnect GitHub?")) return;
        await disconnectGithubIntegration();
        setGithub({ connected: false, repo: null });
    }

    async function handleImport() {
        setImporting(true);
        setImportResult(null);
        try {
            const result = await importGithubReleases();
            setImportResult(`Imported ${result.imported}, skipped ${result.skipped} (already imported).`);
            await refresh();
        } catch (err) {
            alert(err instanceof ApiError ? err.message : "Failed to import releases.");
        } finally {
            setImporting(false);
        }
    }

    if (loading) return <p className="text-neutral-500">Loading…</p>;

    return (
        <div className="max-w-2xl space-y-8">
            <div>
                <h1 className="mb-4 text-2xl font-semibold">Changelog</h1>

                <form onSubmit={handleCreate} className="mb-6 flex gap-2">
                    <input
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        placeholder="Entry title"
                        className="flex-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-500"
                    />
                    <button type="submit" className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white">
                        Create
                    </button>
                </form>

                <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
                    {entries.length === 0 && <p className="p-4 text-sm text-neutral-500">No changelog entries yet.</p>}
                    {entries.map((entry) => (
                        <div key={entry.documentId} className="flex items-center justify-between p-3">
                            <div>
                                <div className="flex items-center gap-2">
                                    <Link href={`/editor/changelog/${entry.documentId}`} className="font-medium hover:underline">
                                        {entry.draftTitle}
                                    </Link>
                                    {entry.draftMeta.version && (
                                        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-600">
                                            {entry.draftMeta.version}
                                        </span>
                                    )}
                                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_CLASS[entry.status]}`}>
                                        {STATUS_LABEL[entry.status]}
                                    </span>
                                </div>
                                <p className="text-xs text-neutral-400">
                                    /changelog/{entry.slug} · updated {entry.updatedAt ? new Date(entry.updatedAt).toLocaleString() : "—"}
                                </p>
                            </div>
                            <button onClick={() => handleDelete(entry.documentId)} className="text-xs text-red-600 hover:underline">
                                Delete
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            <div className="rounded-lg border border-neutral-200 p-4">
                <h2 className="mb-3 text-sm font-semibold">GitHub integration</h2>
                {github?.connected ? (
                    <div className="space-y-3">
                        <p className="text-sm text-neutral-600">
                            Connected to <span className="font-medium">{github.repo}</span>
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={handleImport}
                                disabled={importing}
                                className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-40"
                            >
                                {importing ? "Importing…" : "Import releases"}
                            </button>
                            <button onClick={handleDisconnectGithub} className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-600">
                                Disconnect
                            </button>
                        </div>
                        {importResult && <p className="text-xs text-neutral-500">{importResult}</p>}
                    </div>
                ) : (
                    <form onSubmit={handleConnectGithub} className="space-y-2">
                        <p className="text-xs text-neutral-500">
                            Connect a repo with a fine-grained personal access token (read-only Contents access is enough) to import
                            Releases as draft changelog entries.
                        </p>
                        <input
                            value={repo}
                            onChange={(e) => setRepo(e.target.value)}
                            placeholder="owner/repo"
                            className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-500"
                        />
                        <input
                            value={token}
                            onChange={(e) => setToken(e.target.value)}
                            type="password"
                            placeholder="GitHub personal access token"
                            className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-500"
                        />
                        <button type="submit" disabled={connecting} className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-40">
                            {connecting ? "Connecting…" : "Connect"}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
