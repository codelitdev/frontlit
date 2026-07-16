"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api-client";
import { deleteMedia, listMedia, registerMedia, updateMedia, type Media } from "@/lib/api";
import { useMediaLit } from "@/lib/use-medialit";

function formatSize(bytes?: number | null): string {
    if (!bytes) return "";
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
}

export default function MediaLibraryPage() {
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
        if (!confirm("Delete this media item?")) return;
        try {
            await deleteMedia(mediaId);
            await refresh();
        } catch (err) {
            alert(err instanceof ApiError ? err.message : "Failed to delete media.");
        }
    }

    async function handleAltChange(mediaId: string, alt: string) {
        setItems((prev) => prev.map((item) => (item.mediaId === mediaId ? { ...item, alt } : item)));
    }

    async function handleAltBlur(mediaId: string, alt: string) {
        await updateMedia(mediaId, { alt });
    }

    if (loading) return <p className="text-neutral-500">Loading…</p>;

    return (
        <div className="max-w-4xl">
            <div className="mb-4 flex items-center justify-between">
                <h1 className="text-2xl font-semibold">Media</h1>
                <div>
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelected} />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                        data-testid="upload-button"
                    >
                        {isUploading ? `Uploading… ${Math.round(uploadProgress)}%` : "Upload image"}
                    </button>
                </div>
            </div>

            {error && <p className="mb-4 rounded-md bg-red-50 p-2 text-sm text-red-600" data-testid="upload-error">{error}</p>}

            {items.length === 0 && <p className="text-sm text-neutral-500">No media yet. Upload an image to get started.</p>}

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                {items.map((item) => (
                    <div key={item.mediaId} className="rounded-lg border border-neutral-200 p-2" data-testid="media-item">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={item.thumbnailUrl || item.url}
                            alt={item.alt || ""}
                            className="mb-2 h-24 w-full rounded-md object-cover bg-neutral-100"
                            onError={(e) => {
                                // Thumbnail generation can fail for unusual source
                                // files; fall back to the full image rather than
                                // showing a broken-image icon.
                                const img = e.currentTarget;
                                if (img.src !== item.url) img.src = item.url;
                            }}
                        />
                        <input
                            value={item.alt || ""}
                            onChange={(e) => handleAltChange(item.mediaId, e.target.value)}
                            onBlur={(e) => handleAltBlur(item.mediaId, e.target.value)}
                            placeholder="Alt text"
                            className="mb-1 w-full rounded border border-neutral-200 px-1.5 py-1 text-xs outline-none focus:border-neutral-500"
                        />
                        <p className="truncate text-[10px] text-neutral-400">
                            {item.fileName} · {formatSize(item.size)}
                        </p>
                        <button onClick={() => handleDelete(item.mediaId)} className="mt-1 text-[10px] text-red-600 hover:underline">
                            Delete
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
