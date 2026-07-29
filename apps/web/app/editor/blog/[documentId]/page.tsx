"use client";

import { use, useEffect, useRef, useState } from "react";
import { Editor } from "@frontlit/text-editor";
import type { TextEditorContent } from "@frontlit/text-editor";
import {
    discardBlogPostDraft,
    getBlogPost,
    publishBlogPost,
    updateBlogPost,
    type BlogPost,
} from "@/lib/api";
import { FullScreenLoading } from "@/components/workspace/loading";
import { SlugEditor } from "@/components/workspace/slug-editor";
import { WritingEditorDocumentHeader } from "@/components/workspace/writing-editor-document-header";
import { WritingEditorShell } from "@/components/workspace/writing-editor-shell";
import { Input } from "@/components/ui/codelit/input";
import { Label } from "@/components/ui/codelit/label";
import { Textarea } from "@/components/ui/codelit/textarea";
import { parseTags } from "@/lib/writing-editor";

export default function BlogEditorPage({
    params,
}: {
    params: Promise<{ documentId: string }>;
}) {
    const { documentId } = use(params);
    const [post, setPost] = useState<BlogPost | null>(null);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [tags, setTags] = useState("");
    const [saving, setSaving] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [resetKey, setResetKey] = useState(0);
    const titleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const descriptionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
        null,
    );
    const tagsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        setSettingsOpen(window.matchMedia("(min-width: 768px)").matches);
        getBlogPost(documentId).then((loaded) => {
            setPost(loaded);
            setTitle(loaded.draftTitle);
            setDescription(loaded.draftExcerpt ?? "");
            setTags(loaded.draftMeta.tags.join(", "));
        });
    }, [documentId]);

    useEffect(
        () => () => {
            if (titleDebounceRef.current)
                clearTimeout(titleDebounceRef.current);
            if (descriptionDebounceRef.current)
                clearTimeout(descriptionDebounceRef.current);
            if (tagsDebounceRef.current) clearTimeout(tagsDebounceRef.current);
        },
        [],
    );

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

    function handleDescriptionChange(value: string) {
        setDescription(value);
        if (descriptionDebounceRef.current)
            clearTimeout(descriptionDebounceRef.current);
        descriptionDebounceRef.current = setTimeout(async () => {
            setSaving(true);
            try {
                setPost(await updateBlogPost(documentId, { excerpt: value }));
            } finally {
                setSaving(false);
            }
        }, 600);
    }

    function handleTagsChange(value: string) {
        setTags(value);
        if (tagsDebounceRef.current) clearTimeout(tagsDebounceRef.current);
        tagsDebounceRef.current = setTimeout(async () => {
            setSaving(true);
            try {
                setPost(
                    await updateBlogPost(documentId, {
                        meta: { tags: parseTags(value) },
                    }),
                );
            } finally {
                setSaving(false);
            }
        }, 600);
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
        if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current);
        if (descriptionDebounceRef.current)
            clearTimeout(descriptionDebounceRef.current);
        if (tagsDebounceRef.current) clearTimeout(tagsDebounceRef.current);
        setPublishing(true);
        try {
            const reverted = await discardBlogPostDraft(documentId);
            setPost(reverted);
            setTitle(reverted.draftTitle);
            setDescription(reverted.draftExcerpt ?? "");
            setTags(reverted.draftMeta.tags.join(", "));
            setResetKey((key) => key + 1);
        } finally {
            setPublishing(false);
        }
    }

    async function handleSlugSave(slug: string) {
        const updated = await updateBlogPost(documentId, { slug });
        setPost(updated);
        return updated.slug;
    }

    if (!post) {
        return <FullScreenLoading label="Loading post…" />;
    }

    return (
        <WritingEditorShell
            backHref="/blog"
            backLabel="Blog"
            contextLabel="Posts"
            title={title || "Untitled post"}
            status={post.status}
            statusTestId="blog-status-badge"
            updatedAt={post.updatedAt}
            saving={saving}
            publishing={publishing}
            settingsOpen={settingsOpen}
            onSettingsOpenChange={setSettingsOpen}
            onPublish={handlePublish}
            onDiscardDraft={handleDiscardDraft}
            discardDescription="Discard all unpublished changes on this post? This cannot be undone."
            settings={
                <div className="space-y-7">
                    <SlugEditor
                        slug={post.slug}
                        prefix="/blog/"
                        onSave={handleSlugSave}
                        testId="blog-slug-input"
                    />

                    <div>
                        <div className="flex items-center justify-between gap-3">
                            <Label htmlFor="blog-description">Excerpt</Label>
                            <span className="text-xs tabular-nums text-muted-foreground">
                                {description.length} characters
                            </span>
                        </div>
                        <Textarea
                            id="blog-description"
                            value={description}
                            onChange={(event) =>
                                handleDescriptionChange(event.target.value)
                            }
                            placeholder="A short description for blog listings."
                            className="mt-1 min-h-28"
                        />
                    </div>

                    <div>
                        <Label htmlFor="blog-tags">Tags</Label>
                        <Input
                            id="blog-tags"
                            value={tags}
                            onChange={(event) =>
                                handleTagsChange(event.target.value)
                            }
                            placeholder="Product, engineering, launch"
                            className="mt-1"
                        />
                        <p className="mt-1 text-xs text-muted-foreground">
                            Separate tags with commas.
                        </p>
                    </div>

                    <div className="border-t pt-6">
                        <h3 className="text-sm font-semibold">Publishing</h3>
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                            Your title, excerpt, tags, and article content go
                            live together when you publish changes.
                        </p>
                    </div>
                </div>
            }
        >
            <Editor
                key={resetKey}
                initialContent={post.draftContent}
                onChange={handleContentChange}
                placeholder="Start writing…"
                className="h-full min-h-0 gap-0 overflow-x-hidden overflow-y-auto border-0"
                contentClassName="max-w-[46rem]"
                editorClassName="writing-editor-content min-h-[420px]"
                beforeContent={
                    <WritingEditorDocumentHeader
                        title={title}
                        titlePlaceholder="Post title"
                        description={description}
                        descriptionPlaceholder="Add a short description…"
                        onTitleChange={handleTitleChange}
                        onDescriptionChange={handleDescriptionChange}
                        titleTestId="blog-title-input"
                    />
                }
            />
        </WritingEditorShell>
    );
}
