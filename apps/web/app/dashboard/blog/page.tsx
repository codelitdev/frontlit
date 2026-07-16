"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/api-client";
import { createBlogPost, deleteBlogPost, listBlogPosts, type BlogPost } from "@/lib/api";

const STATUS_LABEL: Record<BlogPost["status"], string> = {
    draft: "Draft",
    published: "Published",
    published_with_changes: "Published · changes",
};

const STATUS_CLASS: Record<BlogPost["status"], string> = {
    draft: "bg-neutral-200 text-neutral-700",
    published: "bg-emerald-100 text-emerald-700",
    published_with_changes: "bg-amber-100 text-amber-700",
};

export default function BlogListPage() {
    const [posts, setPosts] = useState<BlogPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [newTitle, setNewTitle] = useState("");

    function refresh() {
        return listBlogPosts().then(({ items }) => setPosts(items));
    }

    useEffect(() => {
        refresh().finally(() => setLoading(false));
    }, []);

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        if (!newTitle.trim()) return;
        await createBlogPost({ title: newTitle.trim() });
        setNewTitle("");
        await refresh();
    }

    async function handleDelete(documentId: string) {
        if (!confirm("Delete this blog post?")) return;
        try {
            await deleteBlogPost(documentId);
            await refresh();
        } catch (err) {
            alert(err instanceof ApiError ? err.message : "Failed to delete post.");
        }
    }

    if (loading) return <p className="text-neutral-500">Loading…</p>;

    return (
        <div className="max-w-2xl">
            <h1 className="mb-4 text-2xl font-semibold">Blog</h1>

            <form onSubmit={handleCreate} className="mb-6 flex gap-2">
                <input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Post title"
                    className="flex-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-500"
                />
                <button type="submit" className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white">
                    Create
                </button>
            </form>

            <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
                {posts.length === 0 && <p className="p-4 text-sm text-neutral-500">No posts yet.</p>}
                {posts.map((post) => (
                    <div key={post.documentId} className="flex items-center justify-between p-3">
                        <div>
                            <div className="flex items-center gap-2">
                                <Link href={`/editor/blog/${post.documentId}`} className="font-medium hover:underline">
                                    {post.draftTitle}
                                </Link>
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_CLASS[post.status]}`}>
                                    {STATUS_LABEL[post.status]}
                                </span>
                            </div>
                            <p className="text-xs text-neutral-400">
                                /blog/{post.slug} · updated {post.updatedAt ? new Date(post.updatedAt).toLocaleString() : "—"}
                            </p>
                        </div>
                        <button onClick={() => handleDelete(post.documentId)} className="text-xs text-red-600 hover:underline">
                            Delete
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
