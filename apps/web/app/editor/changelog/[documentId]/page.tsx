"use client";

import { use, useEffect, useRef, useState } from "react";
import { Editor } from "@frontlit/text-editor";
import type { TextEditorContent } from "@frontlit/text-editor";
import { discardChangelogEntryDraft, getChangelogEntry, publishChangelogEntry, updateChangelogEntry, type ChangelogEntry } from "@/lib/api";
import { EditorToolbar } from "@/components/workspace/editor-toolbar";
import { FullScreenLoading } from "@/components/workspace/loading";
import { Input } from "@/components/ui/codelit/input";
import { Badge } from "@/components/ui/codelit/badge";
import { Toggle } from "@/components/ui/toggle";

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
        return <FullScreenLoading label="Loading entry…" />;
    }

    return (
        <div className="flex h-screen w-full flex-col">
            <EditorToolbar
                backHref="/changelog"
                backLabel="Changelog"
                status={entry.status}
                saving={saving}
                publishing={publishing}
                onPublish={handlePublish}
                onDiscardDraft={handleDiscardDraft}
                discardDescription="Discard all unpublished changes on this entry? This cannot be undone."
                extra={entry.draftMeta.github && <Badge variant="neutral">Imported from GitHub</Badge>}
            />

            <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-6 py-8">
                <Input
                    value={title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    placeholder="Entry title"
                    className="mb-3 h-auto border-none px-0 text-3xl font-bold shadow-none outline-none focus-visible:ring-0 dark:bg-transparent"
                />
                <div className="mb-6 flex flex-wrap items-center gap-3">
                    <Input value={version} onChange={(e) => handleVersionChange(e.target.value)} placeholder="Version (e.g. v1.2.0)" className="w-auto" />
                    <Input
                        type="date"
                        value={releaseDate}
                        onChange={(e) => handleReleaseDateChange(e.target.value)}
                        className="w-auto"
                        data-testid="changelog-release-date"
                    />
                    <div className="flex flex-wrap gap-1.5" data-testid="changelog-labels">
                        {LABEL_OPTIONS.map((label) => (
                            <Toggle
                                key={label}
                                size="sm"
                                pressed={(entry.draftMeta.labels ?? []).includes(label)}
                                onPressedChange={() => handleLabelToggle(label)}
                                variant="outline"
                                className="capitalize"
                            >
                                {label}
                            </Toggle>
                        ))}
                    </div>
                </div>
                <Editor key={resetKey} initialContent={entry.draftContent} onChange={handleContentChange} placeholder="What changed…" />
            </div>
        </div>
    );
}
