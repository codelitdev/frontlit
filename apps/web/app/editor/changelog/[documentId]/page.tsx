"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Editor } from "@frontlit/text-editor";
import type { TextEditorContent } from "@frontlit/text-editor";
import {
    discardChangelogEntryDraft,
    getChangelogEntry,
    publishChangelogEntry,
    updateChangelogEntry,
    type ChangelogEntry,
} from "@/lib/api";

const STATUS_LABEL: Record<ChangelogEntry["status"], string> = {
    draft: "Draft",
    published: "Published",
    published_with_changes: "Published · unpublished changes",
};

const STATUS_CLASS: Record<ChangelogEntry["status"], string> = {
    draft: "bg-neutral-200 text-neutral-700",
    published: "bg-emerald-100 text-emerald-700",
    published_with_changes: "bg-amber-100 text-amber-700",
};

const LABEL_OPTIONS = ["added", "fixed", "improved", "removed"] as const;

export default function ChangelogEditorPage({ params }: { params: Promise<{ documentId: string }> }) {
    const { documentId } = use(params);
    const [entry, setEntry] = useState<ChangelogEntry | null>(null);
    const [title, setTitle] = useState("");
    const [version, setVersion] = useState("");
    const [releaseDate, setReleaseDate] = useState("");
    const [saving, setSaving] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [resetKey, setResetKey] = useState(0);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        getChangelogEntry(documentId).then((loaded) => {
            setEntry(loaded);
            setTitle(loaded.draftTitle);
            setVersion(loaded.draftMeta.version ?? "");
            setReleaseDate(loaded.draftMeta.releaseDate ?? "");
        });
    }, [documentId]);

    function debouncedSave(fn: () => Promise<void>) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(fn, 600);
    }

    function handleTitleChange(value: string) {
        setTitle(value);
        debouncedSave(async () => {
            setSaving(true);
            try {
                setEntry(await updateChangelogEntry(documentId, { title: value }));
            } finally {
                setSaving(false);
            }
        });
    }

    function handleVersionChange(value: string) {
        setVersion(value);
        debouncedSave(async () => {
            setSaving(true);
            try {
                setEntry(await updateChangelogEntry(documentId, { meta: { version: value } }));
            } finally {
                setSaving(false);
            }
        });
    }

    function handleReleaseDateChange(value: string) {
        setReleaseDate(value);
        debouncedSave(async () => {
            setSaving(true);
            try {
                setEntry(await updateChangelogEntry(documentId, { meta: { releaseDate: value || undefined } }));
            } finally {
                setSaving(false);
            }
        });
    }

    async function handleLabelToggle(label: string) {
        const current = entry?.draftMeta.labels ?? [];
        const labels = current.includes(label) ? current.filter((l) => l !== label) : [...current, label];
        setSaving(true);
        try {
            setEntry(await updateChangelogEntry(documentId, { meta: { labels } }));
        } finally {
            setSaving(false);
        }
    }

    async function handleContentChange(json: TextEditorContent) {
        setSaving(true);
        try {
            setEntry(await updateChangelogEntry(documentId, { content: json }));
        } finally {
            setSaving(false);
        }
    }

    async function handlePublish() {
        setPublishing(true);
        try {
            setEntry(await publishChangelogEntry(documentId));
        } finally {
            setPublishing(false);
        }
    }

    async function handleDiscardDraft() {
        if (!confirm("Discard all unpublished changes on this entry?")) return;
        setPublishing(true);
        try {
            const reverted = await discardChangelogEntryDraft(documentId);
            setEntry(reverted);
            setTitle(reverted.draftTitle);
            setVersion(reverted.draftMeta.version ?? "");
            setReleaseDate(reverted.draftMeta.releaseDate ?? "");
            setResetKey((key) => key + 1);
        } finally {
            setPublishing(false);
        }
    }

    if (!entry) {
        return <div className="flex h-screen w-full items-center justify-center text-neutral-500">Loading entry…</div>;
    }

    return (
        <div className="flex h-screen w-full flex-col">
            <div className="flex h-11 shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-4">
                <Link href="/dashboard/changelog" className="text-xs text-neutral-600 hover:underline">
                    ← Changelog
                </Link>
                <div className="flex items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_CLASS[entry.status]}`}>
                        {STATUS_LABEL[entry.status]}
                    </span>
                    {entry.draftMeta.github && (
                        <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-500">Imported from GitHub</span>
                    )}
                    {saving && <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-500">Saving…</span>}
                    <button
                        onClick={handleDiscardDraft}
                        disabled={publishing || entry.status === "published"}
                        className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        Discard draft
                    </button>
                    <button
                        onClick={handlePublish}
                        disabled={publishing || entry.status === "published"}
                        className="rounded-full bg-neutral-900 px-3 py-1 text-xs text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {publishing ? "Publishing…" : "Publish"}
                    </button>
                </div>
            </div>

            <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-6 py-8">
                <input
                    value={title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    placeholder="Entry title"
                    className="mb-3 w-full border-none text-3xl font-bold outline-none placeholder:text-neutral-300"
                />
                <div className="mb-6 flex flex-wrap items-center gap-3">
                    <input
                        value={version}
                        onChange={(e) => handleVersionChange(e.target.value)}
                        placeholder="Version (e.g. v1.2.0)"
                        className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm outline-none focus:border-neutral-500"
                    />
                    <input
                        type="date"
                        value={releaseDate}
                        onChange={(e) => handleReleaseDateChange(e.target.value)}
                        className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm outline-none focus:border-neutral-500"
                        data-testid="changelog-release-date"
                    />
                    <div className="flex flex-wrap gap-1.5" data-testid="changelog-labels">
                        {LABEL_OPTIONS.map((label) => {
                            const active = (entry.draftMeta.labels ?? []).includes(label);
                            return (
                                <button
                                    key={label}
                                    type="button"
                                    onClick={() => handleLabelToggle(label)}
                                    className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${
                                        active
                                            ? "border-neutral-900 bg-neutral-900 text-white"
                                            : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
                                    }`}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                </div>
                <Editor key={resetKey} initialContent={entry.draftContent} onChange={handleContentChange} placeholder="What changed…" />
            </div>
        </div>
    );
}
