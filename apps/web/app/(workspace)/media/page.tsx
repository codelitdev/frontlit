"use client";

import { useEffect, useState } from "react";
import { Images, Plus } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { deleteMedia, listMedia, updateMedia, type Media } from "@/lib/api";
import { ImageUploadDialog } from "@frontlit/image-uploader";
import type { FrontLitImage } from "@/lib/frontlit-image-uploader";
import { Loading } from "@/components/workspace/loading";
import { ScrollablePage } from "@/components/workspace/scrollable-page";
import { Banner } from "@/components/workspace/banner";
import { DeleteConfirm } from "@/components/workspace/delete-confirm";
import { Button } from "@/components/ui/codelit/button";
import { Input } from "@/components/ui/codelit/input";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/codelit/dialog";
import { useSetBreadcrumb } from "@/components/workspace/breadcrumb-context";

function formatSize(bytes?: number | null): string | null {
    if (!bytes) return null;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
}

export default function MediaPage() {
    useSetBreadcrumb([{ label: "Media library" }]);
    const [items, setItems] = useState<Media[]>([]);
    const [draftAlts, setDraftAlts] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [savingAltId, setSavingAltId] = useState<string | null>(null);
    const [preview, setPreview] = useState<Media | null>(null);
    const [uploadOpen, setUploadOpen] = useState(false);

    function refresh() {
        return listMedia().then(({ items }) => setItems(items));
    }

    useEffect(() => {
        refresh().finally(() => setLoading(false));
    }, []);

    function handleUploaded(image: { media?: FrontLitImage }) {
        if (!image.media) return;
        const media = image.media;
        setItems((current) => {
            if (current.some((item) => item.mediaId === media.mediaId)) {
                return current;
            }
            return [media, ...current];
        });
        toast.success("Image added to the library.");
    }

    async function handleDelete(item: Media) {
        try {
            await deleteMedia(item.mediaId);
            setItems((current) =>
                current.filter((media) => media.mediaId !== item.mediaId),
            );
            setPreview((current) =>
                current?.mediaId === item.mediaId ? null : current,
            );
            toast.success("Media deleted.");
        } catch (err) {
            toast.error(
                err instanceof ApiError
                    ? err.message
                    : "Failed to delete media.",
            );
        }
    }

    async function saveAlt(item: Media) {
        const alt = (draftAlts[item.mediaId] ?? item.alt ?? "").trim();
        if (alt === (item.alt ?? "")) return;
        setSavingAltId(item.mediaId);
        try {
            const updated = await updateMedia(item.mediaId, { alt });
            setItems((current) =>
                current.map((media) =>
                    media.mediaId === item.mediaId ? updated : media,
                ),
            );
            setDraftAlts((current) => {
                const next = { ...current };
                delete next[item.mediaId];
                return next;
            });
        } catch (err) {
            toast.error(
                err instanceof ApiError
                    ? err.message
                    : "Failed to save alt text.",
            );
        } finally {
            setSavingAltId(null);
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
                <header className="mb-7 flex flex-col gap-5 border-b pb-5 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight">
                            Media
                        </h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Images for pages, content, and email.
                        </p>
                    </div>
                    <ImageUploadDialog<FrontLitImage>
                        open={uploadOpen}
                        onOpenChange={setUploadOpen}
                        onSelect={handleUploaded}
                        allowUnsplash={false}
                        allowExistingMedia={false}
                    >
                        <Button data-testid="upload-button">
                            <Plus />
                            Upload image
                        </Button>
                    </ImageUploadDialog>
                </header>

                {error && (
                    <div data-testid="upload-error" className="mb-7">
                        <Banner>{error}</Banner>
                    </div>
                )}

                {items.length === 0 ? (
                    <div className="rounded-xl border border-dashed px-6 py-12 text-center">
                        <Images className="mx-auto size-6 text-muted-foreground" />
                        <h2 className="mt-3 font-semibold">
                            Upload your first image
                        </h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            No media yet. Add an image to use it on the site.
                        </p>
                        <Button
                            type="button"
                            size="sm"
                            className="mt-4"
                            onClick={() => setUploadOpen(true)}
                        >
                            <Plus className="size-4" />
                            Upload image
                        </Button>
                    </div>
                ) : (
                    <div className="divide-y overflow-hidden rounded-xl border bg-card">
                        {items.map((item) => {
                            const fileName = item.fileName || "Untitled";
                            const size = formatSize(item.size);
                            const alt =
                                draftAlts[item.mediaId] ?? item.alt ?? "";
                            const altDirty = alt !== (item.alt ?? "");

                            return (
                                <div
                                    key={item.mediaId}
                                    data-testid="media-item"
                                    className="group flex items-center gap-3 px-4 py-3.5 hover:bg-muted/35 sm:px-5"
                                >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={item.thumbnailUrl || item.url}
                                        alt={item.alt || ""}
                                        className="size-14 shrink-0 rounded-md bg-muted object-cover"
                                        onError={(event) => {
                                            const img = event.currentTarget;
                                            if (img.src !== item.url) {
                                                img.src = item.url;
                                            }
                                        }}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-semibold">
                                            {fileName}
                                        </span>
                                        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
                                            {size ? (
                                                <span className="text-xs text-muted-foreground">
                                                    {size}
                                                </span>
                                            ) : null}
                                            <span className="text-xs text-muted-foreground">
                                                {item.referenceCount === 1
                                                    ? "1 reference"
                                                    : `${item.referenceCount ?? 0} references`}
                                            </span>
                                            <Input
                                                value={alt}
                                                onChange={(event) =>
                                                    setDraftAlts((current) => ({
                                                        ...current,
                                                        [item.mediaId]:
                                                            event.target.value,
                                                    }))
                                                }
                                                onKeyDown={(event) => {
                                                    if (event.key === "Enter") {
                                                        event.preventDefault();
                                                        void saveAlt(item);
                                                    }
                                                }}
                                                placeholder="Alt text"
                                                aria-label={`Alt text for ${fileName}`}
                                                className="h-7 max-w-xs text-xs"
                                            />
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                disabled={
                                                    !altDirty ||
                                                    savingAltId === item.mediaId
                                                }
                                                onClick={() =>
                                                    void saveAlt(item)
                                                }
                                            >
                                                {savingAltId === item.mediaId
                                                    ? "Saving…"
                                                    : "Save alt"}
                                            </Button>
                                        </div>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setPreview(item)}
                                    >
                                        View
                                    </Button>
                                    <DeleteConfirm
                                        title={`Delete ${fileName}?`}
                                        description={`Delete "${fileName}"? This cannot be undone.`}
                                        onConfirm={() => handleDelete(item)}
                                    />
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <Dialog
                open={preview !== null}
                onOpenChange={(open) => {
                    if (!open) setPreview(null);
                }}
            >
                <DialogContent className="max-w-4xl">
                    <DialogHeader>
                        <DialogTitle>
                            {preview?.fileName || "Untitled"}
                        </DialogTitle>
                        <DialogDescription>
                            {[formatSize(preview?.size), preview?.mimeType]
                                .filter(Boolean)
                                .join(" · ") || "Full-size preview"}
                        </DialogDescription>
                    </DialogHeader>
                    {preview ? (
                        <div className="mt-4 overflow-hidden rounded-lg border bg-muted">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={preview.url}
                                alt={preview.alt || preview.fileName || ""}
                                className="mx-auto max-h-[70vh] w-full object-contain"
                            />
                        </div>
                    ) : null}
                </DialogContent>
            </Dialog>
        </ScrollablePage>
    );
}
