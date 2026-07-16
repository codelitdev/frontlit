"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/api-client";
import {
    createDocSection,
    createHelpDoc,
    deleteDocSection,
    deleteHelpDoc,
    listDocSections,
    listHelpDocs,
    searchDocs,
    type DocSearchResult,
    type DocSection,
    type HelpDoc,
} from "@/lib/api";

const STATUS_LABEL: Record<HelpDoc["status"], string> = {
    draft: "Draft",
    published: "Published",
    published_with_changes: "Published · changes",
};

const STATUS_CLASS: Record<HelpDoc["status"], string> = {
    draft: "bg-neutral-200 text-neutral-700",
    published: "bg-emerald-100 text-emerald-700",
    published_with_changes: "bg-amber-100 text-amber-700",
};

export default function DocsPage() {
    const [docs, setDocs] = useState<HelpDoc[]>([]);
    const [sections, setSections] = useState<DocSection[]>([]);
    const [loading, setLoading] = useState(true);
    const [newTitle, setNewTitle] = useState("");
    const [newSectionName, setNewSectionName] = useState("");
    const [query, setQuery] = useState("");
    const [searchResults, setSearchResults] = useState<DocSearchResult[] | null>(null);
    const [searching, setSearching] = useState(false);

    function refresh() {
        return Promise.all([listHelpDocs().then(({ items }) => setDocs(items)), listDocSections().then(({ items }) => setSections(items))]);
    }

    useEffect(() => {
        refresh().finally(() => setLoading(false));
    }, []);

    async function handleCreateDoc(e: React.FormEvent) {
        e.preventDefault();
        if (!newTitle.trim()) return;
        await createHelpDoc({ title: newTitle.trim() });
        setNewTitle("");
        await refresh();
    }

    async function handleDeleteDoc(documentId: string) {
        if (!confirm("Delete this doc?")) return;
        try {
            await deleteHelpDoc(documentId);
            await refresh();
        } catch (err) {
            alert(err instanceof ApiError ? err.message : "Failed to delete doc.");
        }
    }

    async function handleCreateSection(e: React.FormEvent) {
        e.preventDefault();
        if (!newSectionName.trim()) return;
        await createDocSection({ name: newSectionName.trim() });
        setNewSectionName("");
        await refresh();
    }

    async function handleDeleteSection(sectionId: string) {
        if (!confirm("Delete this section?")) return;
        await deleteDocSection(sectionId);
        await refresh();
    }

    async function handleSearch(e: React.FormEvent) {
        e.preventDefault();
        if (!query.trim()) return;
        setSearching(true);
        try {
            const { items } = await searchDocs(query.trim());
            setSearchResults(items);
        } finally {
            setSearching(false);
        }
    }

    if (loading) return <p className="text-neutral-500">Loading…</p>;

    return (
        <div className="grid max-w-5xl grid-cols-3 gap-8">
            <div className="col-span-2">
                <h1 className="mb-4 text-2xl font-semibold">Docs</h1>

                <form onSubmit={handleCreateDoc} className="mb-6 flex gap-2">
                    <input
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        placeholder="Doc title"
                        className="flex-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-500"
                    />
                    <button type="submit" className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white">
                        Create
                    </button>
                </form>

                <div className="mb-8 divide-y divide-neutral-100 rounded-lg border border-neutral-200">
                    {docs.length === 0 && <p className="p-4 text-sm text-neutral-500">No docs yet.</p>}
                    {docs.map((doc) => (
                        <div key={doc.documentId} className="flex items-center justify-between p-3">
                            <div>
                                <div className="flex items-center gap-2">
                                    <Link href={`/editor/docs/${doc.documentId}`} className="font-medium hover:underline">
                                        {doc.draftTitle}
                                    </Link>
                                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_CLASS[doc.status]}`}>
                                        {STATUS_LABEL[doc.status]}
                                    </span>
                                </div>
                                <p className="text-xs text-neutral-400">
                                    /docs/{doc.slug}
                                    {doc.draftMeta.sectionId &&
                                        ` · ${sections.find((s) => s.sectionId === doc.draftMeta.sectionId)?.name ?? "Unknown section"}`}
                                </p>
                            </div>
                            <button onClick={() => handleDeleteDoc(doc.documentId)} className="text-xs text-red-600 hover:underline">
                                Delete
                            </button>
                        </div>
                    ))}
                </div>

                <h2 className="mb-2 text-lg font-semibold">Search published docs</h2>
                <p className="mb-3 text-xs text-neutral-500">
                    Semantic search over pgvector chunks generated when a doc is published (architecture.md §6.4).
                </p>
                <form onSubmit={handleSearch} className="mb-4 flex gap-2">
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Ask a question…"
                        className="flex-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-500"
                        data-testid="doc-search-input"
                    />
                    <button type="submit" className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white" data-testid="doc-search-button">
                        {searching ? "Searching…" : "Search"}
                    </button>
                </form>
                {searchResults && (
                    <div className="space-y-2" data-testid="doc-search-results">
                        {searchResults.length === 0 && <p className="text-sm text-neutral-500">No matches above the similarity floor.</p>}
                        {searchResults.map((result, i) => (
                            <div key={i} className="rounded-md border border-neutral-200 p-3 text-sm">
                                <div className="flex items-center justify-between">
                                    <span className="font-medium">
                                        {result.title} {result.heading && `· ${result.heading}`}
                                    </span>
                                    <span className="text-xs text-neutral-400">{(result.similarity * 100).toFixed(1)}% match</span>
                                </div>
                                <p className="mt-1 text-neutral-600">{result.content}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div>
                <h2 className="mb-2 text-lg font-semibold">Sections</h2>
                <form onSubmit={handleCreateSection} className="mb-3 flex gap-2">
                    <input
                        value={newSectionName}
                        onChange={(e) => setNewSectionName(e.target.value)}
                        placeholder="Section name"
                        className="flex-1 rounded-md border border-neutral-300 px-2 py-1 text-xs outline-none focus:border-neutral-500"
                    />
                    <button type="submit" className="rounded-md bg-neutral-900 px-2 py-1 text-xs text-white">
                        Add
                    </button>
                </form>
                <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
                    {sections.length === 0 && <p className="p-3 text-xs text-neutral-500">No sections yet.</p>}
                    {sections.map((section) => (
                        <div key={section.sectionId} className="flex items-center justify-between p-2 text-xs">
                            <span>{section.name}</span>
                            <button onClick={() => handleDeleteSection(section.sectionId)} className="text-red-600 hover:underline">
                                Delete
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
