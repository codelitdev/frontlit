"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FilePlus2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import {
    createBlogPost,
    deleteBlogPost,
    listBlogPosts,
    type BlogPost,
} from "@/lib/api";
import {
    filterBlogPosts,
    getBlogStatusCounts,
    sortBlogPostsByUpdatedAt,
    type BlogFilter,
} from "@/lib/blog-screen";
import { formatSavedAt, parseTags } from "@/lib/writing-editor";
import { cn } from "@/lib/utils";
import { Loading } from "@/components/workspace/loading";
import { ScrollablePage } from "@/components/workspace/scrollable-page";
import { DeleteConfirm } from "@/components/workspace/delete-confirm";
import { DocumentStatusBadge } from "@/components/workspace/document-status-badge";
import { useSetBreadcrumb } from "@/components/workspace/breadcrumb-context";
import { Badge } from "@/components/ui/codelit/badge";
import { Button } from "@/components/ui/codelit/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/codelit/dialog";
import { Input } from "@/components/ui/codelit/input";
import { Label } from "@/components/ui/codelit/label";

const FILTERS: Array<{ value: BlogFilter; label: string }> = [
    { value: "all", label: "All" },
    { value: "published", label: "Live" },
    { value: "draft", label: "Drafts" },
    { value: "changes", label: "Changes" },
];

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
    return `${count} ${count === 1 ? singular : pluralForm}`;
}

function relativeUpdatedAt(value: string | null) {
    const formatted = formatSavedAt(value);
    if (formatted === "Not saved yet") return formatted;
    return formatted.replace(/^Saved /, "");
}

export default function BlogPage() {
    useSetBreadcrumb([{ label: "Blog" }]);
    const router = useRouter();
    const [posts, setPosts] = useState<BlogPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<BlogFilter>("all");
    const [query, setQuery] = useState("");

    const [newPostOpen, setNewPostOpen] = useState(false);
    const [newTitle, setNewTitle] = useState("");
    const [newTags, setNewTags] = useState("");
    const [createError, setCreateError] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        listBlogPosts({ itemsPerPage: 500 })
            .then(({ items }) => setPosts(items))
            .catch((error) => {
                toast.error(
                    error instanceof ApiError
                        ? error.message
                        : "Failed to load posts.",
                );
            })
            .finally(() => setLoading(false));
    }, []);

    const counts = useMemo(() => getBlogStatusCounts(posts), [posts]);
    const visiblePosts = useMemo(
        () => sortBlogPostsByUpdatedAt(filterBlogPosts(posts, filter, query)),
        [posts, filter, query],
    );

    function openNewPost() {
        setNewTitle("");
        setNewTags("");
        setCreateError(null);
        setNewPostOpen(true);
    }

    async function handleCreate(event: React.FormEvent) {
        event.preventDefault();
        const title = newTitle.trim();
        if (!title) {
            setCreateError("Enter a post title.");
            return;
        }

        setCreateError(null);
        setCreating(true);
        try {
            const created = await createBlogPost({
                title,
                meta: { tags: parseTags(newTags) },
            });
            setNewPostOpen(false);
            router.push(`/editor/blog/${created.documentId}`);
        } catch (error) {
            const message =
                error instanceof ApiError
                    ? error.message
                    : "Failed to create post.";
            setCreateError(message);
            toast.error(message);
        } finally {
            setCreating(false);
        }
    }

    async function handleDelete(documentId: string) {
        try {
            await deleteBlogPost(documentId);
            setPosts((current) =>
                current.filter((post) => post.documentId !== documentId),
            );
            toast.success("Post deleted.");
        } catch (error) {
            toast.error(
                error instanceof ApiError
                    ? error.message
                    : "Failed to delete post.",
            );
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
                <header className="flex flex-col gap-5 border-b pb-5 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight">
                            Blog
                        </h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {plural(counts.published, "live post")} ·{" "}
                            {plural(counts.draft, "draft")} ·{" "}
                            {plural(counts.changes, "post")} with unpublished
                            changes
                        </p>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <div className="relative sm:w-80">
                            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                id="blog-filter"
                                name="blogFilter"
                                value={query}
                                onChange={(event) =>
                                    setQuery(event.target.value)
                                }
                                placeholder="Filter by title, slug, or tag"
                                aria-label="Filter posts by title, slug, or tag"
                                className="pl-9"
                            />
                        </div>
                        <Button type="button" onClick={openNewPost}>
                            <Plus className="size-4" />
                            New post
                        </Button>
                    </div>
                </header>

                <div className="flex flex-col gap-3 border-b py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div
                        role="tablist"
                        aria-label="Filter posts by publishing status"
                        className="flex w-fit rounded-lg bg-muted p-1"
                    >
                        {FILTERS.map((item) => {
                            const count =
                                item.value === "all"
                                    ? counts.all
                                    : item.value === "published"
                                      ? counts.published
                                      : item.value === "draft"
                                        ? counts.draft
                                        : counts.changes;

                            return (
                                <button
                                    key={item.value}
                                    type="button"
                                    role="tab"
                                    aria-selected={filter === item.value}
                                    onClick={() => setFilter(item.value)}
                                    className={cn(
                                        "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors",
                                        filter === item.value &&
                                            "bg-card text-foreground shadow-sm",
                                    )}
                                >
                                    {item.label}{" "}
                                    <span className="ml-1 tabular-nums">
                                        {count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Most recently updated
                    </p>
                </div>

                <section className="py-6">
                    {visiblePosts.length === 0 ? (
                        <div className="rounded-xl border border-dashed px-6 py-12 text-center">
                            <FilePlus2 className="mx-auto size-6 text-muted-foreground" />
                            <h2 className="mt-3 font-semibold">
                                {posts.length === 0
                                    ? "Write your first post"
                                    : "No posts match"}
                            </h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                                {posts.length === 0
                                    ? "Start a draft, then publish it when it is ready."
                                    : "Try another status, title, slug, or tag."}
                            </p>
                            {posts.length === 0 && (
                                <Button
                                    type="button"
                                    size="sm"
                                    className="mt-4"
                                    onClick={openNewPost}
                                >
                                    <Plus className="size-4" />
                                    New post
                                </Button>
                            )}
                        </div>
                    ) : (
                        <div className="divide-y overflow-hidden rounded-xl border bg-card">
                            {visiblePosts.map((post) => (
                                <div
                                    key={post.documentId}
                                    className="group flex items-center gap-3 px-4 py-3.5 hover:bg-muted/35 sm:px-5"
                                >
                                    <Link
                                        href={`/editor/blog/${post.documentId}`}
                                        className="min-w-0 flex-1"
                                    >
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="truncate text-sm font-semibold group-hover:underline">
                                                {post.draftTitle}
                                            </span>
                                            {post.status !== "published" && (
                                                <DocumentStatusBadge
                                                    status={post.status}
                                                />
                                            )}
                                        </div>
                                        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
                                            <span className="truncate font-mono text-xs text-muted-foreground">
                                                /blog/{post.slug}
                                            </span>
                                            {post.draftMeta.tags.map((tag) => (
                                                <Badge
                                                    key={tag}
                                                    variant="neutral"
                                                    className="px-2 py-0.5 text-[0.6875rem] font-medium"
                                                >
                                                    {tag}
                                                </Badge>
                                            ))}
                                        </div>
                                    </Link>
                                    <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                                        {relativeUpdatedAt(post.updatedAt)}
                                    </span>
                                    <DeleteConfirm
                                        title={`Delete ${post.draftTitle}?`}
                                        description="This post and its published version will be permanently deleted."
                                        onConfirm={() =>
                                            handleDelete(post.documentId)
                                        }
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>

            <Dialog open={newPostOpen} onOpenChange={setNewPostOpen}>
                <DialogContent>
                    <form onSubmit={handleCreate}>
                        <DialogHeader>
                            <DialogTitle>New post</DialogTitle>
                            <DialogDescription>
                                Create a draft and start writing.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="mt-5 space-y-4">
                            <div>
                                <Label htmlFor="post-title">Title</Label>
                                <Input
                                    id="post-title"
                                    name="title"
                                    autoComplete="off"
                                    autoFocus
                                    value={newTitle}
                                    onChange={(event) => {
                                        setNewTitle(event.target.value);
                                        if (createError) setCreateError(null);
                                    }}
                                    placeholder="What do you want to share?"
                                    aria-invalid={Boolean(createError)}
                                    aria-describedby={
                                        createError
                                            ? "post-title-error"
                                            : undefined
                                    }
                                    className="mt-1"
                                    disabled={creating}
                                />
                                {createError && (
                                    <p
                                        id="post-title-error"
                                        role="alert"
                                        className="mt-1 text-sm text-destructive"
                                    >
                                        {createError}
                                    </p>
                                )}
                            </div>

                            <div>
                                <Label htmlFor="post-tags">Tags</Label>
                                <Input
                                    id="post-tags"
                                    name="tags"
                                    value={newTags}
                                    onChange={(event) =>
                                        setNewTags(event.target.value)
                                    }
                                    placeholder="Product, engineering, launch"
                                    className="mt-1"
                                    disabled={creating}
                                />
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Separate tags with commas. You can change
                                    these later.
                                </p>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setNewPostOpen(false)}
                                disabled={creating}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={creating}>
                                {creating ? "Creating…" : "Create post"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </ScrollablePage>
    );
}
