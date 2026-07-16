"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/api-client";
import { createPage, deletePage, listPages, type Page, type PageType } from "@/lib/api";

const pageTypes: PageType[] = ["site", "blog", "landing", "post", "custom"];

const STATUS_LABEL: Record<Page["status"], string> = {
    draft: "Draft",
    published: "Published",
    published_with_changes: "Published · changes",
};

const STATUS_CLASS: Record<Page["status"], string> = {
    draft: "bg-neutral-200 text-neutral-700",
    published: "bg-emerald-100 text-emerald-700",
    published_with_changes: "bg-amber-100 text-amber-700",
};

export default function PagesListPage() {
    const [pages, setPages] = useState<Page[]>([]);
    const [loading, setLoading] = useState(true);
    const [newPageName, setNewPageName] = useState("");
    const [newPageType, setNewPageType] = useState<PageType>("landing");

    function refresh() {
        return listPages().then(({ items }) => setPages(items));
    }

    useEffect(() => {
        refresh().finally(() => setLoading(false));
    }, []);

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        if (!newPageName.trim()) return;
        await createPage({ name: newPageName.trim(), type: newPageType });
        setNewPageName("");
        await refresh();
    }

    async function handleDelete(pageId: string) {
        if (!confirm("Delete this page?")) return;
        try {
            await deletePage(pageId);
            await refresh();
        } catch (error) {
            alert(error instanceof ApiError ? error.message : "Failed to delete page.");
        }
    }

    if (loading) return <p className="text-neutral-500">Loading…</p>;

    return (
        <div className="max-w-2xl">
            <h1 className="mb-4 text-2xl font-semibold">Pages</h1>

            <form onSubmit={handleCreate} className="mb-6 flex gap-2">
                <input
                    value={newPageName}
                    onChange={(e) => setNewPageName(e.target.value)}
                    placeholder="Page name"
                    className="flex-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-500"
                />
                <select
                    value={newPageType}
                    onChange={(e) => setNewPageType(e.target.value as PageType)}
                    className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                >
                    {pageTypes.map((type) => (
                        <option key={type} value={type}>
                            {type}
                        </option>
                    ))}
                </select>
                <button type="submit" className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white">
                    Create
                </button>
            </form>

            <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
                {pages.length === 0 && <p className="p-4 text-sm text-neutral-500">No pages yet.</p>}
                {pages.map((page) => (
                    <div key={page.pageId} className="flex items-center justify-between p-3">
                        <div>
                            <div className="flex items-center gap-2">
                                <Link href={`/editor/pages/${page.pageId}`} className="font-medium hover:underline">
                                    {page.name}
                                </Link>
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_CLASS[page.status]}`}>
                                    {STATUS_LABEL[page.status]}
                                </span>
                            </div>
                            <p className="text-xs text-neutral-400">
                                /{page.slug} · {page.type} · updated {page.updatedAt ? new Date(page.updatedAt).toLocaleString() : "—"}
                            </p>
                        </div>
                        <button
                            onClick={() => handleDelete(page.pageId)}
                            disabled={!page.deleteable}
                            title={page.deleteable ? undefined : "Standard pages can't be deleted"}
                            className="text-xs text-red-600 hover:underline disabled:cursor-not-allowed disabled:text-neutral-300 disabled:no-underline"
                        >
                            Delete
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
