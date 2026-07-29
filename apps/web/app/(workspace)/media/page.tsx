"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api-client";
import { deleteMedia, listMedia, registerMedia, updateMedia, type Media } from "@/lib/api";
import { useMediaLit } from "@/lib/use-medialit";
import { PageHeader } from "@/components/workspace/page-header";
import { Loading } from "@/components/workspace/loading";
import { ScrollablePage } from "@/components/workspace/scrollable-page";
import { Banner } from "@/components/workspace/banner";
import { DeleteConfirm } from "@/components/workspace/delete-confirm";
import { Button } from "@/components/ui/codelit/button";
import { Input } from "@/components/ui/codelit/input";
import { Card, CardContent } from "@/components/ui/codelit/card";
import { useSetBreadcrumb } from "@/components/workspace/breadcrumb-context";

function formatSize(bytes?: number | null): string {
    if (!bytes) return "";
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
}

export default function MediaPage() {
    useSetBreadcrumb([{ label: "Media library" }]);
    const [items, setItems] = useState<Media[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    function refresh() {
        return listMedia().then(({ items }) => setItems(items));
    }

    useEffect(() => {
        refresh().finally(() => setLoading(false));
    }, []);

    const { isUploading, uploadProgress, uploadFile } = useMediaLit({
        signatureEndpoint: "/api/proxy/media/presigned",
        access: "public",
        onUploadError: (err) => setError(err.message),
    });

    async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;

        setError(null);
        try {
            const media = await uploadFile(file);
            await registerMedia({ mediaLitId: media.mediaId });
            await refresh();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Upload failed.");
        }
    }

    async function handleDelete(mediaId: string) {
        try {
            await deleteMedia(mediaId);
            await refresh();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : "Failed to delete media.");
        }
    }

    async function handleAltChange(mediaId: string, alt: string) {
        setItems((prev) => prev.map((item) => (item.mediaId === mediaId ? { ...item, alt } : item)));
    }

    async function handleAltBlur(mediaId: string, alt: string) {
        await updateMedia(mediaId, { alt });
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
            <div className="max-w-4xl">
                <PageHeader
                    title="Media"
                    action={
                        <div>
                            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelected} />
                            <Button onClick={() => fileInputRef.current?.click()} disabled={isUploading} data-testid="upload-button">
                                {isUploading ? `Uploading… ${Math.round(uploadProgress)}%` : "Upload image"}
                            </Button>
                        </div>
                    }
                />

                {error && (
                    <div data-testid="upload-error">
                        <Banner className="mb-4">{error}</Banner>
                    </div>
                )}

                {items.length === 0 && <p className="text-sm text-muted-foreground">No media yet. Upload an image to get started.</p>}

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                    {items.map((item) => (
                        <Card key={item.mediaId} className="gap-2 py-2" data-testid="media-item">
                            <CardContent className="space-y-1 px-2">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={item.thumbnailUrl || item.url}
                                    alt={item.alt || ""}
                                    className="mb-2 h-24 w-full rounded-md bg-muted object-cover"
                                    onError={(e) => {
                                        // Thumbnail generation can fail for unusual source
                                        // files; fall back to the full image rather than
                                        // showing a broken-image icon.
                                        const img = e.currentTarget;
                                        if (img.src !== item.url) img.src = item.url;
                                    }}
                                />
                                <Input
                                    value={item.alt || ""}
                                    onChange={(e) => handleAltChange(item.mediaId, e.target.value)}
                                    onBlur={(e) => handleAltBlur(item.mediaId, e.target.value)}
                                    placeholder="Alt text"
                                    className="h-7 text-xs"
                                />
                                <p className="truncate text-[10px] text-muted-foreground">
                                    {item.fileName} · {formatSize(item.size)}
                                </p>
                                <DeleteConfirm
                                    description={`Delete "${item.fileName}"? This cannot be undone.`}
                                    onConfirm={() => handleDelete(item.mediaId)}
                                    trigger={
                                        <Button variant="ghost" size="sm" className="h-auto p-0 text-[10px] text-destructive hover:text-destructive">
                                            Delete
                                        </Button>
                                    }
                                />
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </ScrollablePage>
    );
}
