"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
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
import { PageHeader } from "@/components/workspace/page-header";
import { Loading } from "@/components/workspace/loading";
import { ScrollablePage } from "@/components/workspace/scrollable-page";
import { DeleteConfirm } from "@/components/workspace/delete-confirm";
import { DocumentStatusBadge } from "@/components/workspace/document-status-badge";
import { Button } from "@/components/ui/codelit/button";
import { Input } from "@/components/ui/codelit/input";
import { Label } from "@/components/ui/codelit/label";
import { Badge } from "@/components/ui/codelit/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/codelit/card";
import { useSetBreadcrumb } from "@/components/workspace/breadcrumb-context";

export default function ChangelogPage() {
    useSetBreadcrumb([{ label: "Changelog" }]);
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
        try {
            await deleteChangelogEntry(documentId);
            await refresh();
        } catch (err) {
            toast.error(err instanceof ApiError ? err.message : "Failed to delete entry.");
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
            toast.error(err instanceof ApiError ? err.message : "Failed to connect GitHub.");
        } finally {
            setConnecting(false);
        }
    }

    async function handleDisconnectGithub() {
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
            toast.error(err instanceof ApiError ? err.message : "Failed to import releases.");
        } finally {
            setImporting(false);
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
                <div>
                    <PageHeader title="Changelog" />

                    <form onSubmit={handleCreate} className="mb-6 flex gap-2">
                        <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Entry title" className="flex-1" />
                        <Button type="submit">Create</Button>
                    </form>

                    <div className="divide-y rounded-lg border">
                        {entries.length === 0 && <p className="p-4 text-sm text-muted-foreground">No changelog entries yet.</p>}
                        {entries.map((entry) => (
                            <div key={entry.documentId} className="flex items-center justify-between p-3">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <Link href={`/editor/changelog/${entry.documentId}`} className="font-medium hover:underline">
                                            {entry.draftTitle}
                                        </Link>
                                        {entry.draftMeta.version && <Badge variant="neutral">{entry.draftMeta.version}</Badge>}
                                        <DocumentStatusBadge status={entry.status} />
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        /changelog/{entry.slug} · updated {entry.updatedAt ? new Date(entry.updatedAt).toLocaleString() : "—"}
                                    </p>
                                </div>
                                <DeleteConfirm
                                    description={`Delete "${entry.draftTitle}"? This cannot be undone.`}
                                    onConfirm={() => handleDelete(entry.documentId)}
                                />
                            </div>
                        ))}
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm">GitHub integration</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {github?.connected ? (
                            <div className="space-y-3">
                                <p className="text-sm text-muted-foreground">
                                    Connected to <span className="font-medium text-foreground">{github.repo}</span>
                                </p>
                                <div className="flex gap-2">
                                    <Button onClick={handleImport} disabled={importing}>
                                        {importing ? "Importing…" : "Import releases"}
                                    </Button>
                                    <Button variant="outline" onClick={handleDisconnectGithub}>
                                        Disconnect
                                    </Button>
                                </div>
                                {importResult && <p className="text-xs text-muted-foreground">{importResult}</p>}
                            </div>
                        ) : (
                            <form onSubmit={handleConnectGithub} className="space-y-3">
                                <p className="text-xs text-muted-foreground">
                                    Connect a repo with a fine-grained personal access token (read-only Contents access is enough) to import
                                    Releases as draft changelog entries.
                                </p>
                                <div className="space-y-1.5">
                                    <Label htmlFor="gh-repo">Repository</Label>
                                    <Input id="gh-repo" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/repo" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="gh-token">Personal access token</Label>
                                    <Input id="gh-token" value={token} onChange={(e) => setToken(e.target.value)} type="password" />
                                </div>
                                <Button type="submit" disabled={connecting}>
                                    {connecting ? "Connecting…" : "Connect"}
                                </Button>
                            </form>
                        )}
                    </CardContent>
                </Card>
            </div>
        </ScrollablePage>
    );
}
