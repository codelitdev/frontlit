"use client";

import { use, useEffect, useRef, useState } from "react";
import {
    PageBuilder,
    type PageBuilderState,
} from "@frontlit/page-builder/builder";
import type { Theme as BuilderTheme } from "@frontlit/page-builder/models";
import {
    createTheme,
    discardPageDraft,
    getPage,
    getTheme,
    listThemes,
    publishPage,
    updatePage,
    updateTheme,
    type Page,
} from "@/lib/api";
import {
    persistCustomThemes,
    resolveEditorTheme,
    themeSnapshot,
} from "@/lib/page-theme";
import { EditorToolbar } from "@/components/workspace/editor-toolbar";
import { FullScreenLoading } from "@/components/workspace/loading";
import { SlugEditor } from "@/components/workspace/slug-editor";

export default function PageEditorPage({
    params,
}: {
    params: Promise<{ pageId: string }>;
}) {
    const { pageId } = use(params);
    const [page, setPage] = useState<Page | null>(null);
    const [initialTheme, setInitialTheme] = useState<BuilderTheme | undefined>(
        undefined,
    );
    const [customThemes, setCustomThemes] = useState<BuilderTheme[] | null>(
        null,
    );
    const [saving, setSaving] = useState(false);
    const [publishing, setPublishing] = useState(false);
    // Bumped only when the draft is reset from outside the builder (discard),
    // forcing a remount so the (otherwise uncontrolled) builder re-reads the
    // fresh draft fields instead of showing stale, already-discarded edits.
    const [resetKey, setResetKey] = useState(0);
    const themeAliasesRef = useRef(new Map<string, string>());
    const knownThemeIdsRef = useRef(new Set<string>());
    const themeSnapshotsRef = useRef(new Map<string, string>());

    useEffect(() => {
        Promise.all([getPage(pageId), listThemes()]).then(
            async ([loaded, savedThemes]) => {
                const mappedThemes = savedThemes.items.map(
                    (theme): BuilderTheme => ({
                        id: theme.themeId,
                        name: theme.name,
                        theme: theme.style as unknown as BuilderTheme["theme"],
                    }),
                );

                knownThemeIdsRef.current = new Set(
                    mappedThemes.map((theme) => theme.id),
                );
                themeAliasesRef.current = new Map();
                themeSnapshotsRef.current = new Map(
                    mappedThemes.map((theme) => [
                        theme.id,
                        themeSnapshot(theme),
                    ]),
                );
                setInitialTheme(
                    await resolveEditorTheme(
                        loaded.themeId,
                        async (themeId) => {
                            const loadedTheme = savedThemes.items.find(
                                (theme) => theme.themeId === themeId,
                            );
                            return loadedTheme ?? getTheme(themeId);
                        },
                    ),
                );
                setCustomThemes(mappedThemes);
                setPage(loaded);
            },
        );
    }, [pageId]);

    async function handleChange(state: PageBuilderState) {
        setSaving(true);
        try {
            await persistCustomThemes(state.customThemes, {
                aliases: themeAliasesRef.current,
                knownIds: knownThemeIdsRef.current,
                snapshots: themeSnapshotsRef.current,
                create: createTheme,
                update: updateTheme,
            });
            const updated = await updatePage(pageId, {
                layout: state.layout,
                title: state.seo.title,
                description: state.seo.description,
                socialImage: state.seo.socialImage as unknown as
                    Record<string, unknown> | undefined,
                robotsAllowed: state.seo.robotsAllowed,
                themeId:
                    themeAliasesRef.current.get(state.theme.id) ??
                    state.theme.id,
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
        setPublishing(true);
        try {
            setPage(await discardPageDraft(pageId));
            setResetKey((key) => key + 1);
        } finally {
            setPublishing(false);
        }
    }

    async function handleSlugSave(slug: string) {
        const updated = await updatePage(pageId, { slug });
        setPage(updated);
        return updated.slug;
    }

    if (!page || customThemes === null) {
        return <FullScreenLoading label="Loading page…" />;
    }

    return (
        <div className="flex h-dvh min-h-0 w-full min-w-0 flex-col overflow-hidden">
            <EditorToolbar
                backHref="/website/pages"
                backLabel="Pages"
                status={page.status}
                statusTestId="page-status-badge"
                saving={saving}
                publishing={publishing}
                onPublish={handlePublish}
                onDiscardDraft={handleDiscardDraft}
                discardDescription="Discard all unpublished changes on this page? This cannot be undone."
            />
            <div className="border-b bg-muted/20 px-4 py-3">
                <SlugEditor
                    slug={page.slug}
                    prefix="/"
                    onSave={handleSlugSave}
                    disabled={page.slug === ""}
                    disabledReason="The homepage URL is fixed at /."
                    testId="page-slug-input"
                />
            </div>
            <div className="relative min-h-0 flex-1 overflow-hidden">
                <PageBuilder
                    key={resetKey}
                    pageData={{ pageType: page.type }}
                    initialLayout={page.draftLayout}
                    initialTheme={initialTheme}
                    themes={{ custom: customThemes }}
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
