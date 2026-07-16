"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Editor } from "@frontlit/text-editor";
import type { TextEditorContent } from "@frontlit/text-editor";
import {
    discardHelpDocDraft,
    getHelpDoc,
    listDocSections,
    publishHelpDoc,
    updateHelpDoc,
    type DocSection,
    type HelpDoc,
} from "@/lib/api";

const STATUS_LABEL: Record<HelpDoc["status"], string> = {
    draft: "Draft",
    published: "Published",
    published_with_changes: "Published · unpublished changes",
};

const STATUS_CLASS: Record<HelpDoc["status"], string> = {
    draft: "bg-neutral-200 text-neutral-700",
    published: "bg-emerald-100 text-emerald-700",
    published_with_changes: "bg-amber-100 text-amber-700",
};

export default function HelpDocEditorPage({ params }: { params: Promise<{ documentId: string }> }) {
    const { documentId } = use(params);
    const [doc, setDoc] = useState<HelpDoc | null>(null);
    const [sections, setSections] = useState<DocSection[]>([]);
    const [title, setTitle] = useState("");
    const [saving, setSaving] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [resetKey, setResetKey] = useState(0);
    const titleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        getHelpDoc(documentId).then((loaded) => {
            setDoc(loaded);
            setTitle(loaded.draftTitle);
        });
        listDocSections().then(({ items }) => setSections(items));
    }, [documentId]);

    async function handleSectionChange(sectionId: string) {
        setSaving(true);
        try {
            setDoc(
                await updateHelpDoc(documentId, {
                    meta: { sectionId: sectionId || undefined, order: doc?.draftMeta.order ?? 0 },
                }),
            );
        } finally {
            setSaving(false);
        }
    }

    async function saveTitle(value: string) {
        setSaving(true);
        try {
            setDoc(await updateHelpDoc(documentId, { title: value }));
        } finally {
            setSaving(false);
        }
    }

    function handleTitleChange(value: string) {
        setTitle(value);
        if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current);
        titleDebounceRef.current = setTimeout(() => saveTitle(value), 600);
    }

    async function handleContentChange(json: TextEditorContent) {
        setSaving(true);
        try {
            setDoc(await updateHelpDoc(documentId, { content: json }));
        } finally {
            setSaving(false);
        }
    }

    async function handlePublish() {
        setPublishing(true);
        try {
            setDoc(await publishHelpDoc(documentId));
        } finally {
            setPublishing(false);
        }
    }

    async function handleDiscardDraft() {
        if (!confirm("Discard all unpublished changes on this doc?")) return;
        setPublishing(true);
        try {
            const reverted = await discardHelpDocDraft(documentId);
            setDoc(reverted);
            setTitle(reverted.draftTitle);
            setResetKey((key) => key + 1);
        } finally {
            setPublishing(false);
        }
    }

    if (!doc) {
        return <div className="flex h-screen w-full items-center justify-center text-neutral-500">Loading doc…</div>;
    }

    return (
        <div className="flex h-screen w-full flex-col">
            <div className="flex h-11 shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-4">
                <Link href="/dashboard/docs" className="text-xs text-neutral-600 hover:underline">
                    ← Docs
                </Link>
                <div className="flex items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_CLASS[doc.status]}`} data-testid="doc-status-badge">
                        {STATUS_LABEL[doc.status]}
                    </span>
                    {saving && <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-500">Saving…</span>}
                    <button
                        onClick={handleDiscardDraft}
                        disabled={publishing || doc.status === "published"}
                        className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        Discard draft
                    </button>
                    <button
                        onClick={handlePublish}
                        disabled={publishing || doc.status === "published"}
                        className="rounded-full bg-neutral-900 px-3 py-1 text-xs text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
                        data-testid="publish-button"
                    >
                        {publishing ? "Publishing…" : "Publish"}
                    </button>
                </div>
            </div>

            <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-6 py-8">
                <input
                    value={title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    placeholder="Doc title"
                    className="mb-2 w-full border-none text-3xl font-bold outline-none placeholder:text-neutral-300"
                    data-testid="doc-title-input"
                />
                <select
                    value={doc.draftMeta.sectionId ?? ""}
                    onChange={(e) => handleSectionChange(e.target.value)}
                    className="mb-6 rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600 outline-none focus:border-neutral-500"
                    data-testid="doc-section-select"
                >
                    <option value="">No section</option>
                    {sections.map((section) => (
                        <option key={section.sectionId} value={section.sectionId}>
                            {section.name}
                        </option>
                    ))}
                </select>
                <Editor
                    key={resetKey}
                    initialContent={doc.draftContent}
                    onChange={handleContentChange}
                    placeholder="Write the doc… use headings to organize into sections."
                />
            </div>
        </div>
    );
}
