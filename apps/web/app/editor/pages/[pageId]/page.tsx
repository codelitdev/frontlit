"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { PageBuilder, type PageBuilderState } from "@frontlit/page-builder/builder";
import type { Theme as BuilderTheme } from "@frontlit/page-builder/models";
import {
    discardPageDraft,
    getPage,
    getTheme,
    publishPage,
    updatePage,
    type Page,
} from "@/lib/api";

const STATUS_LABEL: Record<Page["status"], string> = {
    draft: "Draft",
    published: "Published",
    published_with_changes: "Published · unpublished changes",
};

const STATUS_CLASS: Record<Page["status"], string> = {
    draft: "bg-neutral-200 text-neutral-700",
    published: "bg-emerald-100 text-emerald-700",
    published_with_changes: "bg-amber-100 text-amber-700",
};

export default function PageEditorPage({ params }: { params: Promise<{ pageId: string }> }) {
    const { pageId } = use(params);
    const [page, setPage] = useState<Page | null>(null);
    const [initialTheme, setInitialTheme] = useState<BuilderTheme | undefined>(undefined);
    const [saving, setSaving] = useState(false);
    const [publishing, setPublishing] = useState(false);
    // Bumped only when the draft is reset from outside the builder (discard),
    // forcing a remount so the (otherwise uncontrolled) builder re-reads the
    // fresh draft fields instead of showing stale, already-discarded edits.
    const [resetKey, setResetKey] = useState(0);

    useEffect(() => {
        getPage(pageId).then(async (loaded) => {
            setPage(loaded);
            if (loaded.themeId) {
                const theme = await getTheme(loaded.themeId);
                setInitialTheme({ id: theme.themeId, name: theme.name, theme: theme.style as unknown as BuilderTheme["theme"] });
            }
        });
    }, [pageId]);

    async function handleChange(state: PageBuilderState) {
        setSaving(true);
        try {
            const updated = await updatePage(pageId, {
                layout: state.layout,
                title: state.seo.title,
                description: state.seo.description,
                socialImage: state.seo.socialImage as unknown as Record<string, unknown> | undefined,
                robotsAllowed: state.seo.robotsAllowed,
                // Only persist the theme reference if the active theme is one of
                // this team's saved themes (not a built-in preset).
                themeId: state.theme.id === initialTheme?.id ? initialTheme.id : undefined,
            });
            setPage(updated);
        } finally {
            setSaving(false);
        }
    }

    async function handlePublish() {
        setPublishing(true);
        try {
            setPage(await publishPage(pageId));
        } finally {
            setPublishing(false);
        }
    }

    async function handleDiscardDraft() {
        if (!confirm("Discard all unpublished changes on this page?")) return;
        setPublishing(true);
        try {
            setPage(await discardPageDraft(pageId));
            setResetKey((key) => key + 1);
        } finally {
            setPublishing(false);
        }
    }

    if (!page) {
        return <div className="flex h-screen w-screen items-center justify-center text-neutral-500">Loading page…</div>;
    }

    return (
        <div className="flex h-screen w-screen flex-col">
            <div className="flex h-11 shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-4">
                <Link href="/dashboard/pages" className="text-xs text-neutral-600 hover:underline">
                    ← Pages
                </Link>
                <div className="flex items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_CLASS[page.status]}`} data-testid="page-status-badge">
                        {STATUS_LABEL[page.status]}
                    </span>
                    {saving && <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-500">Saving…</span>}
                    <button
                        onClick={handleDiscardDraft}
                        disabled={publishing || page.status === "published"}
                        className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        Discard draft
                    </button>
                    <button
                        onClick={handlePublish}
                        disabled={publishing || page.status === "published"}
                        className="rounded-full bg-neutral-900 px-3 py-1 text-xs text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
                        data-testid="publish-button"
                    >
                        {publishing ? "Publishing…" : "Publish"}
                    </button>
                </div>
            </div>
            <div className="relative min-h-0 flex-1">
                <PageBuilder
                    key={resetKey}
                    pageData={{ pageType: page.type }}
                    initialLayout={page.draftLayout}
                    initialTheme={initialTheme}
                    initialSeo={{
                        title: page.draftTitle ?? undefined,
                        description: page.draftDescription ?? undefined,
                        robotsAllowed: page.draftRobotsAllowed ?? undefined,
                    }}
                    onChange={handleChange}
                />
            </div>
        </div>
    );
}
