"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import {
    connectGithubIntegration,
    createProductUpdate,
    deleteProductUpdate,
    disconnectGithubIntegration,
    getGithubIntegration,
    importGithubReleases,
    listProductUpdates,
    type ProductUpdate,
    type GithubIntegration,
} from "@/lib/api";
import { PageHeader } from "@/components/workspace/page-header";
import { Loading } from "@/components/workspace/loading";
import { ScrollablePage } from "@/components/workspace/scrollable-page";
import { DeleteConfirm } from "@/components/workspace/delete-confirm";
import { DocumentStatusBadge } from "@/components/workspace/document-status-badge";
import { DocumentIndexBadge } from "@/components/workspace/document-index-badge";
import { Button } from "@/components/ui/codelit/button";
import { Input } from "@/components/ui/codelit/input";
import { Label } from "@/components/ui/codelit/label";
import { Badge } from "@/components/ui/codelit/badge";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/ui/codelit/card";
import { useSetBreadcrumb } from "@/components/workspace/breadcrumb-context";

export default function ChangelogPage() {
    useSetBreadcrumb([
        { label: "Content", href: "/content" },
        { label: "Changelog" },
    ]);
    const router = useRouter();
    const [entries, setEntries] = useState<ProductUpdate[]>([]);
    const [loading, setLoading] = useState(true);
    const [newTitle, setNewTitle] = useState("");
    const [createError, setCreateError] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [github, setGithub] = useState<GithubIntegration | null>(null);
    const [repo, setRepo] = useState("");
    const [token, setToken] = useState("");
    const [connecting, setConnecting] = useState(false);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<string | null>(null);

    function refresh() {
        return listProductUpdates().then(({ items }) => setEntries(items));
    }

    function refreshGithub() {
        return getGithubIntegration().then(setGithub);
    }

    useEffect(() => {
        Promise.all([refresh(), refreshGithub()]).finally(() =>
            setLoading(false),
        );
    }, []);

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        const title = newTitle.trim();
        if (!title) {
            setCreateError("Enter a changelog title.");
            return;
        }

        setCreateError(null);
        setCreating(true);
        try {
            const created = await createProductUpdate({ title });
            setNewTitle("");
            router.push(`/editor/content/changelog/${created.documentId}`);
        } catch (err) {
            const message =
                err instanceof ApiError
                    ? err.message
                    : "Failed to create changelog entry.";
            setCreateError(message);
            toast.error(message);
        } finally {
            setCreating(false);
        }
    }

    async function handleDelete(documentId: string) {
        try {
            await deleteProductUpdate(documentId);
            await refresh();
        } catch (err) {
            toast.error(
                err instanceof ApiError
                    ? err.message
                    : "Failed to delete entry.",
            );
        }
    }

    async function handleConnectGithub(e: React.FormEvent) {
        e.preventDefault();
        if (!repo.trim() || !token.trim()) return;
        setConnecting(true);
        try {
            setGithub(
                await connectGithubIntegration({
                    repo: repo.trim(),
                    token: token.trim(),
                }),
            );
            setRepo("");
            setToken("");
        } catch (err) {
            toast.error(
                err instanceof ApiError
                    ? err.message
                    : "Failed to connect GitHub.",
            );
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
            setImportResult(
                `Imported ${result.imported}, skipped ${result.skipped} (already imported).`,
            );
            await refresh();
        } catch (err) {
            toast.error(
                err instanceof ApiError
                    ? err.message
                    : "Failed to import releases.",
            );
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
            <div className="mx-auto w-full max-w-6xl">
                <div className="max-w-2xl space-y-8">
                    <div>
                        <PageHeader title="Changelog" />

                        <form
                            onSubmit={handleCreate}
                            className="mb-6 space-y-2"
                        >
                            <div className="flex gap-2">
                                <Input
                                    value={newTitle}
                                    onChange={(e) => {
                                        setNewTitle(e.target.value);
                                        if (createError) setCreateError(null);
                                    }}
                                    placeholder="Entry title"
                                    className="flex-1"
                                    aria-invalid={Boolean(createError)}
                                    aria-describedby={
                                        createError
                                            ? "changelog-create-error"
                                            : undefined
                                    }
                                    disabled={creating}
                                />
                                <Button type="submit" disabled={creating}>
                                    {creating ? "Creating…" : "Create"}
                                </Button>
                            </div>
                            {createError ? (
                                <p
                                    id="changelog-create-error"
                                    className="text-sm text-destructive"
                                >
                                    {createError}
                                </p>
                            ) : null}
                        </form>

                        <div className="divide-y rounded-lg border">
                            {entries.length === 0 && (
                                <p className="p-4 text-sm text-muted-foreground">
                                    No changelog entries yet.
                                </p>
                            )}
                            {entries.map((entry) => (
                                <div
                                    key={entry.documentId}
                                    className="flex items-center justify-between p-3"
                                >
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <Link
                                                href={`/editor/content/changelog/${entry.documentId}`}
                                                className="font-medium hover:underline"
                                            >
                                                {entry.draftTitle}
                                            </Link>
                                            {entry.draftMeta.version && (
                                                <Badge variant="neutral">
                                                    {entry.draftMeta.version}
                                                </Badge>
                                            )}
                                            <DocumentStatusBadge
                                                status={entry.status}
                                            />
                                            <DocumentIndexBadge
                                                index={entry.index}
                                            />
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            /changelog/{entry.slug} · updated{" "}
                                            {entry.updatedAt
                                                ? new Date(
                                                      entry.updatedAt,
                                                  ).toLocaleString()
                                                : "—"}
                                        </p>
                                    </div>
                                    <DeleteConfirm
                                        description={`Delete "${entry.draftTitle}"? This cannot be undone.`}
                                        onConfirm={() =>
                                            handleDelete(entry.documentId)
                                        }
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm">
                                GitHub integration
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {github?.connected ? (
                                <div className="space-y-3">
                                    <p className="text-sm text-muted-foreground">
                                        Connected to{" "}
                                        <span className="font-medium text-foreground">
                                            {github.repo}
                                        </span>
                                    </p>
                                    <div className="flex gap-2">
                                        <Button
                                            onClick={handleImport}
                                            disabled={importing}
                                        >
                                            {importing
                                                ? "Importing…"
                                                : "Import releases"}
                                        </Button>
                                        <Button
                                            variant="outline"
                                            onClick={handleDisconnectGithub}
                                        >
                                            Disconnect
                                        </Button>
                                    </div>
                                    {importResult && (
                                        <p className="text-xs text-muted-foreground">
                                            {importResult}
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <form
                                    onSubmit={handleConnectGithub}
                                    className="space-y-3"
                                >
                                    <p className="text-xs text-muted-foreground">
                                        Connect a repo with a fine-grained
                                        personal access token (read-only
                                        Contents access is enough) to import
                                        Releases as draft changelog entries.
                                    </p>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="gh-repo">
                                            Repository
                                        </Label>
                                        <Input
                                            id="gh-repo"
                                            value={repo}
                                            onChange={(e) =>
                                                setRepo(e.target.value)
                                            }
                                            placeholder="owner/repo"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="gh-token">
                                            Personal access token
                                        </Label>
                                        <Input
                                            id="gh-token"
                                            value={token}
                                            onChange={(e) =>
                                                setToken(e.target.value)
                                            }
                                            type="password"
                                        />
                                    </div>
                                    <Button type="submit" disabled={connecting}>
                                        {connecting ? "Connecting…" : "Connect"}
                                    </Button>
                                </form>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </ScrollablePage>
    );
}
