"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    ChevronDown,
    ChevronRight,
    FilePlus2,
    FolderPlus,
    Pencil,
    Plus,
    Search,
    Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { validateDocTitle } from "@/lib/doc-create";
import {
    createDocumentationSection,
    createDocumentationPage,
    deleteDocumentationSection,
    deleteDocumentationPage,
    listDocumentationSections,
    listDocumentationPages,
    searchDocumentation,
    updateDocumentationSection,
    updateDocumentationPage,
    type DocumentationSearchResult,
    type DocumentationSection,
    type DocumentationPage,
} from "@/lib/api";
import {
    filterDocs,
    getDocStatusCounts,
    groupDocsBySection,
    type DocsFilter,
} from "@/lib/docs-screen";
import { formatSavedAt } from "@/lib/writing-editor";
import { cn } from "@/lib/utils";
import { Loading } from "@/components/workspace/loading";
import { ScrollablePage } from "@/components/workspace/scrollable-page";
import { DeleteConfirm } from "@/components/workspace/delete-confirm";
import { DocumentStatusBadge } from "@/components/workspace/document-status-badge";
import { Button } from "@/components/ui/codelit/button";
import { Input } from "@/components/ui/codelit/input";
import { Card, CardContent } from "@/components/ui/codelit/card";
import { useSetBreadcrumb } from "@/components/workspace/breadcrumb-context";
import { ContentTypeNav } from "@/components/content/content-type-nav";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/codelit/dialog";
import { Label } from "@/components/ui/codelit/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/codelit/select";

const NO_SECTION = "none";

const FILTERS: Array<{ value: DocsFilter; label: string }> = [
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

export default function DocumentationPage() {
    useSetBreadcrumb([
        { label: "Content", href: "/content" },
        { label: "Documentation" },
    ]);

    const router = useRouter();
    const [docs, setDocs] = useState<DocumentationPage[]>([]);
    const [sections, setSections] = useState<DocumentationSection[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<DocsFilter>("all");
    const [titleFilter, setTitleFilter] = useState("");
    const [askMode, setAskMode] = useState(false);
    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
        new Set(),
    );

    const [newDocOpen, setNewDocOpen] = useState(false);
    const [newTitle, setNewTitle] = useState("");
    const [newDocSectionId, setNewDocSectionId] = useState(NO_SECTION);
    const [createError, setCreateError] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);

    const [sectionDialogOpen, setSectionDialogOpen] = useState(false);
    const [editingSection, setEditingSection] =
        useState<DocumentationSection | null>(null);
    const [sectionName, setSectionName] = useState("");
    const [sectionSaving, setSectionSaving] = useState(false);

    const [query, setQuery] = useState("");
    const [searchResults, setSearchResults] = useState<
        DocumentationSearchResult[] | null
    >(null);
    const [searching, setSearching] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);

    async function refresh() {
        const [docResult, sectionResult] = await Promise.all([
            listDocumentationPages({ itemsPerPage: 500 }),
            listDocumentationSections(),
        ]);
        setDocs(docResult.items);
        setSections(sectionResult.items);
    }

    useEffect(() => {
        refresh()
            .catch((error) => {
                toast.error(
                    error instanceof ApiError
                        ? error.message
                        : "Failed to load docs.",
                );
            })
            .finally(() => setLoading(false));
    }, []);

    const counts = useMemo(() => getDocStatusCounts(docs), [docs]);
    const filteredDocs = useMemo(
        () => filterDocs(docs, filter, titleFilter),
        [docs, filter, titleFilter],
    );
    const groups = useMemo(
        () =>
            groupDocsBySection(filteredDocs, sections).filter(
                (group) =>
                    group.docs.length > 0 ||
                    (filter === "all" && !titleFilter.trim()),
            ),
        [filteredDocs, sections, filter, titleFilter],
    );

    function openNewDoc(sectionId = NO_SECTION) {
        setNewTitle("");
        setCreateError(null);
        setNewDocSectionId(sectionId);
        setNewDocOpen(true);
    }

    async function handleCreateDoc(event: React.FormEvent) {
        event.preventDefault();
        const validation = validateDocTitle(newTitle);
        if (validation.ok === false) {
            setCreateError(validation.error);
            return;
        }

        setCreateError(null);
        setCreating(true);
        try {
            const sectionDocs = docs.filter(
                (doc) =>
                    (doc.draftMeta.sectionId ?? NO_SECTION) === newDocSectionId,
            );
            const created = await createDocumentationPage({
                title: validation.title,
                meta: {
                    sectionId:
                        newDocSectionId === NO_SECTION
                            ? undefined
                            : newDocSectionId,
                    order: sectionDocs.length,
                },
            });
            setNewDocOpen(false);
            router.push(`/editor/content/documentation/${created.documentId}`);
        } catch (error) {
            const message =
                error instanceof ApiError
                    ? error.message
                    : "Failed to create doc.";
            setCreateError(message);
            toast.error(message);
        } finally {
            setCreating(false);
        }
    }

    async function handleDeleteDoc(documentId: string) {
        try {
            await deleteDocumentationPage(documentId);
            setDocs((current) =>
                current.filter((doc) => doc.documentId !== documentId),
            );
            toast.success("Doc deleted.");
        } catch (error) {
            toast.error(
                error instanceof ApiError
                    ? error.message
                    : "Failed to delete doc.",
            );
        }
    }

    function openAddSection() {
        setEditingSection(null);
        setSectionName("");
        setSectionDialogOpen(true);
    }

    function openRenameSection(section: DocumentationSection) {
        setEditingSection(section);
        setSectionName(section.name);
        setSectionDialogOpen(true);
    }

    async function handleSaveSection(event: React.FormEvent) {
        event.preventDefault();
        const name = sectionName.trim();
        if (!name) return;

        setSectionSaving(true);
        try {
            if (editingSection) {
                await updateDocumentationSection(editingSection.sectionId, {
                    name,
                });
                toast.success("Section renamed.");
            } else {
                await createDocumentationSection({
                    name,
                    order: sections.length,
                });
                toast.success("Section added.");
            }
            setSectionDialogOpen(false);
            await refresh();
        } catch (error) {
            toast.error(
                error instanceof ApiError
                    ? error.message
                    : "Failed to save section.",
            );
        } finally {
            setSectionSaving(false);
        }
    }

    async function handleDeleteSection(section: DocumentationSection) {
        try {
            const assignedDocs = docs.filter(
                (doc) => doc.draftMeta.sectionId === section.sectionId,
            );
            await Promise.all(
                assignedDocs.map((doc) =>
                    updateDocumentationPage(doc.documentId, {
                        meta: { order: doc.draftMeta.order },
                    }),
                ),
            );
            await deleteDocumentationSection(section.sectionId);
            await refresh();
            toast.success("Section deleted. Its docs are now unsectioned.");
        } catch (error) {
            toast.error(
                error instanceof ApiError
                    ? error.message
                    : "Failed to delete section.",
            );
        }
    }

    function toggleSection(groupId: string | null) {
        const key = groupId ?? NO_SECTION;
        setCollapsedSections((current) => {
            const next = new Set(current);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }

    async function handleSearch(event: React.FormEvent) {
        event.preventDefault();
        if (!query.trim()) return;

        setSearching(true);
        setSearchError(null);
        try {
            const { items } = await searchDocumentation(query.trim());
            setSearchResults(items);
        } catch (error) {
            const message =
                error instanceof ApiError ? error.message : "Search failed.";
            setSearchError(message);
            toast.error(message);
        } finally {
            setSearching(false);
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
                <ContentTypeNav activeType="documentation" />
                <header className="flex flex-col gap-5 border-b pb-5 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight">
                            Docs
                        </h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {plural(counts.published, "live doc")} ·{" "}
                            {plural(counts.draft, "draft")} ·{" "}
                            {plural(counts.changes, "doc")} with unpublished
                            changes
                        </p>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <div className="relative sm:w-72">
                            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                id="docs-filter"
                                name="docsFilter"
                                value={titleFilter}
                                onChange={(event) =>
                                    setTitleFilter(event.target.value)
                                }
                                placeholder="Filter by title or slug"
                                aria-label="Filter docs by title or slug"
                                className="pl-9"
                            />
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setAskMode((current) => !current)}
                        >
                            <Sparkles className="size-4" />
                            {askMode ? "Back to docs" : "Ask docs"}
                        </Button>
                        <Button type="button" onClick={() => openNewDoc()}>
                            <Plus className="size-4" />
                            New doc
                        </Button>
                    </div>
                </header>

                {askMode ? (
                    <section className="max-w-3xl py-8">
                        <div className="mb-5">
                            <h2 className="text-xl font-semibold">
                                Ask your docs
                            </h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Search the semantic index built from your
                                published docs. Results are matching source
                                passages, not an AI-generated answer.
                            </p>
                        </div>

                        <form
                            onSubmit={handleSearch}
                            className="flex flex-col gap-2 sm:flex-row"
                        >
                            <div className="relative flex-1">
                                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={query}
                                    onChange={(event) =>
                                        setQuery(event.target.value)
                                    }
                                    id="doc-search"
                                    name="query"
                                    autoComplete="off"
                                    placeholder="Ask a question about your published docs…"
                                    className="pl-9"
                                    data-testid="doc-search-input"
                                />
                            </div>
                            <Button
                                type="submit"
                                disabled={searching || !query.trim()}
                                data-testid="doc-search-button"
                            >
                                {searching ? "Searching…" : "Ask"}
                            </Button>
                        </form>

                        {searchError && (
                            <p
                                role="alert"
                                className="mt-3 text-sm text-destructive"
                            >
                                {searchError}
                            </p>
                        )}

                        {searchResults && (
                            <div
                                className="mt-7"
                                data-testid="doc-search-results"
                            >
                                <h3 className="mb-3 text-sm font-semibold">
                                    Top matching passages
                                </h3>
                                {searchResults.length === 0 ? (
                                    <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                                        No matches found in published docs.
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {searchResults.map((result, index) => (
                                            <Card
                                                key={`${result.documentId}-${result.anchor ?? index}`}
                                            >
                                                <CardContent className="p-0">
                                                    <div className="p-5">
                                                        <p className="line-clamp-4 text-sm leading-6">
                                                            {result.content}
                                                        </p>
                                                    </div>
                                                    <div className="flex flex-col gap-2 border-t bg-muted/30 px-5 py-3 text-xs sm:flex-row sm:items-center sm:justify-between">
                                                        <div className="min-w-0">
                                                            <span className="mr-2 font-semibold text-muted-foreground">
                                                                FROM
                                                            </span>
                                                            <Link
                                                                href={`/editor/content/documentation/${result.documentId}`}
                                                                className="font-medium text-primary hover:underline"
                                                            >
                                                                {result.title ??
                                                                    "Untitled doc"}
                                                            </Link>
                                                            {result.heading && (
                                                                <span className="text-muted-foreground">
                                                                    {" "}
                                                                    ·{" "}
                                                                    {
                                                                        result.heading
                                                                    }
                                                                </span>
                                                            )}
                                                        </div>
                                                        <span className="shrink-0 tabular-nums text-muted-foreground">
                                                            {(
                                                                result.similarity *
                                                                100
                                                            ).toFixed(0)}
                                                            % match
                                                        </span>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </section>
                ) : (
                    <>
                        <div className="flex flex-col gap-3 border-b py-3 sm:flex-row sm:items-center sm:justify-between">
                            <div
                                role="tablist"
                                aria-label="Filter docs by publishing status"
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
                                            aria-selected={
                                                filter === item.value
                                            }
                                            onClick={() =>
                                                setFilter(item.value)
                                            }
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
                            <div className="text-sm text-muted-foreground">
                                Grouped by section
                            </div>
                        </div>

                        <section className="space-y-7 py-6">
                            {groups.length === 0 && (
                                <div className="rounded-lg border border-dashed px-6 py-12 text-center">
                                    <FilePlus2 className="mx-auto size-6 text-muted-foreground" />
                                    <h2 className="mt-3 font-semibold">
                                        {docs.length === 0
                                            ? "Create your first doc"
                                            : "No docs match"}
                                    </h2>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        {docs.length === 0
                                            ? "Start a draft, then publish it when it is ready."
                                            : "Try another status or search term."}
                                    </p>
                                    {docs.length === 0 && (
                                        <Button
                                            type="button"
                                            size="sm"
                                            className="mt-4"
                                            onClick={() => openNewDoc()}
                                        >
                                            <Plus className="size-4" />
                                            New doc
                                        </Button>
                                    )}
                                </div>
                            )}

                            {groups.map((group) => {
                                const groupKey = group.id ?? NO_SECTION;
                                const collapsed =
                                    collapsedSections.has(groupKey);

                                return (
                                    <div key={groupKey}>
                                        <div className="mb-2 flex min-h-8 items-center gap-2">
                                            <button
                                                type="button"
                                                aria-label={`${collapsed ? "Expand" : "Collapse"} ${group.name}`}
                                                onClick={() =>
                                                    toggleSection(group.id)
                                                }
                                                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                                            >
                                                {collapsed ? (
                                                    <ChevronRight className="size-4" />
                                                ) : (
                                                    <ChevronDown className="size-4" />
                                                )}
                                            </button>
                                            <h2 className="text-sm font-semibold">
                                                {group.name}
                                            </h2>
                                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                                                {group.docs.length}
                                            </span>
                                            <div className="ml-auto flex items-center gap-1">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() =>
                                                        openNewDoc(
                                                            group.id ??
                                                                NO_SECTION,
                                                        )
                                                    }
                                                >
                                                    <Plus className="size-4" />
                                                    New
                                                </Button>
                                                {group.section && (
                                                    <>
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            aria-label={`Rename ${group.name}`}
                                                            onClick={() =>
                                                                openRenameSection(
                                                                    group.section!,
                                                                )
                                                            }
                                                        >
                                                            <Pencil className="size-4" />
                                                        </Button>
                                                        <DeleteConfirm
                                                            title={`Delete ${group.name}?`}
                                                            description={`Delete this section? Its ${plural(group.docs.length, "doc")} will become unsectioned.`}
                                                            onConfirm={() =>
                                                                handleDeleteSection(
                                                                    group.section!,
                                                                )
                                                            }
                                                        />
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {!collapsed && (
                                            <div className="divide-y overflow-hidden rounded-xl border bg-card">
                                                {group.docs.length === 0 ? (
                                                    <div className="px-5 py-6 text-center text-sm text-muted-foreground">
                                                        No docs in this section.
                                                    </div>
                                                ) : (
                                                    group.docs.map((doc) => (
                                                        <div
                                                            key={doc.documentId}
                                                            className="group flex items-center gap-3 px-4 py-3 hover:bg-muted/35 sm:px-5"
                                                        >
                                                            <Link
                                                                href={`/editor/content/documentation/${doc.documentId}`}
                                                                className="min-w-0 flex-1"
                                                            >
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <span className="truncate text-sm font-semibold group-hover:underline">
                                                                        {
                                                                            doc.draftTitle
                                                                        }
                                                                    </span>
                                                                    {doc.status !==
                                                                        "published" && (
                                                                        <DocumentStatusBadge
                                                                            status={
                                                                                doc.status
                                                                            }
                                                                        />
                                                                    )}
                                                                </div>
                                                                <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                                                                    /docs/
                                                                    {doc.slug}
                                                                </p>
                                                            </Link>
                                                            <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                                                                {relativeUpdatedAt(
                                                                    doc.updatedAt,
                                                                )}
                                                            </span>
                                                            <DeleteConfirm
                                                                title={`Delete ${doc.draftTitle}?`}
                                                                description="This doc and its published version will be permanently deleted."
                                                                onConfirm={() =>
                                                                    handleDeleteDoc(
                                                                        doc.documentId,
                                                                    )
                                                                }
                                                            />
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            <button
                                type="button"
                                onClick={openAddSection}
                                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-muted/35 hover:text-foreground"
                            >
                                <FolderPlus className="size-4" />
                                Add section
                            </button>
                        </section>
                    </>
                )}
            </div>

            <Dialog open={newDocOpen} onOpenChange={setNewDocOpen}>
                <DialogContent>
                    <form onSubmit={handleCreateDoc}>
                        <DialogHeader>
                            <DialogTitle>New doc</DialogTitle>
                            <DialogDescription>
                                Create a draft and start writing.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="mt-5 space-y-4">
                            <div>
                                <Label htmlFor="doc-title">Title</Label>
                                <Input
                                    id="doc-title"
                                    name="title"
                                    autoComplete="off"
                                    autoFocus
                                    value={newTitle}
                                    onChange={(event) => {
                                        setNewTitle(event.target.value);
                                        if (createError) setCreateError(null);
                                    }}
                                    placeholder="What is this doc about?"
                                    aria-invalid={Boolean(createError)}
                                    aria-describedby={
                                        createError
                                            ? "doc-title-error"
                                            : undefined
                                    }
                                    className="mt-1"
                                    disabled={creating}
                                />
                                {createError && (
                                    <p
                                        id="doc-title-error"
                                        role="alert"
                                        className="mt-1 text-sm text-destructive"
                                    >
                                        {createError}
                                    </p>
                                )}
                            </div>

                            <div>
                                <Label htmlFor="new-doc-section">Section</Label>
                                <Select
                                    name="sectionId"
                                    value={newDocSectionId}
                                    onValueChange={setNewDocSectionId}
                                    disabled={creating}
                                >
                                    <SelectTrigger
                                        id="new-doc-section"
                                        className="mt-1"
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NO_SECTION}>
                                            No section
                                        </SelectItem>
                                        {sections.map((section) => (
                                            <SelectItem
                                                key={section.sectionId}
                                                value={section.sectionId}
                                            >
                                                {section.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setNewDocOpen(false)}
                                disabled={creating}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={creating}>
                                {creating ? "Creating…" : "Create doc"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog
                open={sectionDialogOpen}
                onOpenChange={setSectionDialogOpen}
            >
                <DialogContent>
                    <form onSubmit={handleSaveSection}>
                        <DialogHeader>
                            <DialogTitle>
                                {editingSection
                                    ? "Rename section"
                                    : "Add section"}
                            </DialogTitle>
                            <DialogDescription>
                                Sections organize docs in this workspace and the
                                help center.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="mt-5">
                            <Label htmlFor="section-name">Name</Label>
                            <Input
                                id="section-name"
                                name="sectionName"
                                value={sectionName}
                                onChange={(event) =>
                                    setSectionName(event.target.value)
                                }
                                placeholder="Getting started"
                                autoFocus
                                className="mt-1"
                                disabled={sectionSaving}
                            />
                        </div>

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setSectionDialogOpen(false)}
                                disabled={sectionSaving}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={sectionSaving || !sectionName.trim()}
                            >
                                {sectionSaving
                                    ? "Saving…"
                                    : editingSection
                                      ? "Save name"
                                      : "Add section"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </ScrollablePage>
    );
}
