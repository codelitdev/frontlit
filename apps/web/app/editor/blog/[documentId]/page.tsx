"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Editor } from "@frontlit/text-editor";
import type { TextEditorContent } from "@frontlit/text-editor";
import {
    discardBlogPostDraft,
    getBlogPost,
    publishBlogPost,
    updateBlogPost,
    type BlogPost,
} from "@/lib/api";

const STATUS_LABEL: Record<BlogPost["status"], string> = {
    draft: "Draft",
    published: "Published",
    published_with_changes: "Published · unpublished changes",
};

const STATUS_CLASS: Record<BlogPost["status"], string> = {
    draft: "bg-neutral-200 text-neutral-700",
    published: "bg-emerald-100 text-emerald-700",
    published_with_changes: "bg-amber-100 text-amber-700",
};

export default function BlogEditorPage({ params }: { params: Promise<{ documentId: string }> }) {
    const { documentId } = use(params);
    const [post, setPost] = useState<BlogPost | null>(null);
    const [title, setTitle] = useState("");
    const [saving, setSaving] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [resetKey, setResetKey] = useState(0);
    const titleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        getBlogPost(documentId).then((loaded) => {
            setPost(loaded);
            setTitle(loaded.draftTitle);
        });
    }, [documentId]);

    async function saveTitle(value: string) {
        setSaving(true);
        try {
            setPost(await updateBlogPost(documentId, { title: value }));
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
            setPost(await updateBlogPost(documentId, { content: json }));
        } finally {
            setSaving(false);
        }
    }

    async function handlePublish() {
        setPublishing(true);
        try {
            setPost(await publishBlogPost(documentId));
        } finally {
            setPublishing(false);
        }
    }

    async function handleDiscardDraft() {
        if (!confirm("Discard all unpublished changes on this post?")) return;
        setPublishing(true);
        try {
            const reverted = await discardBlogPostDraft(documentId);
            setPost(reverted);
            setTitle(reverted.draftTitle);
            setResetKey((key) => key + 1);
        } finally {
            setPublishing(false);
        }
    }

    if (!post) {
        return <div className="flex h-screen w-full items-center justify-center text-neutral-500">Loading post…</div>;
    }

    return (
        <div className="flex h-screen w-full flex-col">
            <div className="flex h-11 shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-4">
                <Link href="/dashboard/blog" className="text-xs text-neutral-600 hover:underline">
                    ← Blog
                </Link>
                <div className="flex items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_CLASS[post.status]}`} data-testid="blog-status-badge">
                        {STATUS_LABEL[post.status]}
                    </span>
                    {saving && <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-500">Saving…</span>}
                    <button
                        onClick={handleDiscardDraft}
                        disabled={publishing || post.status === "published"}
                        className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        Discard draft
                    </button>
                    <button
                        onClick={handlePublish}
                        disabled={publishing || post.status === "published"}
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
                    placeholder="Post title"
                    className="mb-6 w-full border-none text-3xl font-bold outline-none placeholder:text-neutral-300"
                    data-testid="blog-title-input"
                />
                <Editor
                    key={resetKey}
                    initialContent={post.draftContent}
                    onChange={handleContentChange}
                    placeholder="Start writing…"
                />
            </div>
        </div>
    );
}
