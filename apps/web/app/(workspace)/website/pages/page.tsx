"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FilePlus2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { createPage, deletePage, listPages, type Page, type PageType } from "@/lib/api";
import {
    filterPages,
    getPageStatusCounts,
    PAGE_TYPE_LABELS,
    pagePath,
    sortPagesForLibrary,
    type PagesFilter,
} from "@/lib/pages-screen";
import { formatSavedAt } from "@/lib/writing-editor";
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/codelit/select";

const PAGE_TYPES: PageType[] = ["site", "blog", "landing", "post", "custom"];

const PAGE_TYPE_DESCRIPTIONS: Record<PageType, string> = {
    site: "A general website page with shared site layout.",
    blog: "A page designed to present your blog.",
    landing: "A focused campaign or marketing page.",
    post: "A standalone editorial page.",
    custom: "A flexible page without a predefined purpose.",
};

const FILTERS: Array<{ value: PagesFilter; label: string }> = [
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

export default function PagesPage() {
    useSetBreadcrumb([{ label: "Website", href: "/website/pages" }, { label: "Pages" }]);
    const router = useRouter();
    const [pages, setPages] = useState<Page[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<PagesFilter>("all");
    const [query, setQuery] = useState("");

    const [newPageOpen, setNewPageOpen] = useState(false);
    const [newPageName, setNewPageName] = useState("");
    const [newPageType, setNewPageType] = useState<PageType>("landing");
    const [createError, setCreateError] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        listPages({ itemsPerPage: 500 })
            .then(({ items }) => setPages(items))
            .catch((error) => {
                toast.error(error instanceof ApiError ? error.message : "Failed to load pages.");
            })
            .finally(() => setLoading(false));
    }, []);

    const counts = useMemo(() => getPageStatusCounts(pages), [pages]);
    const visiblePages = useMemo(
        () => sortPagesForLibrary(filterPages(pages, filter, query)),
        [pages, filter, query],
    );

    function openNewPage() {
        setNewPageName("");
        setNewPageType("landing");
        setCreateError(null);
        setNewPageOpen(true);
    }

    async function handleCreate(event: React.FormEvent) {
        event.preventDefault();
        const name = newPageName.trim();
        if (!name) {
            setCreateError("Enter a page name.");
            return;
        }

        setCreateError(null);
        setCreating(true);
        try {
            const created = await createPage({ name, type: newPageType });
            setNewPageOpen(false);
            router.push(`/editor/pages/${created.pageId}`);
        } catch (error) {
            const message = error instanceof ApiError ? error.message : "Failed to create page.";
            setCreateError(message);
            toast.error(message);
        } finally {
            setCreating(false);
        }
    }

    async function handleDelete(page: Page) {
        try {
            await deletePage(page.pageId);
            setPages((current) => current.filter((item) => item.pageId !== page.pageId));
            toast.success("Page deleted.");
        } catch (error) {
            toast.error(error instanceof ApiError ? error.message : "Failed to delete page.");
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
                        <h1 className="text-2xl font-semibold tracking-tight">Pages</h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {plural(counts.published, "live page")} · {plural(counts.draft, "draft")} ·{" "}
                            {plural(counts.changes, "page")} with unpublished changes
                        </p>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <div className="relative sm:w-80">
                            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                id="pages-filter"
                                name="pagesFilter"
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="Filter by name, slug, or type"
                                aria-label="Filter pages by name, slug, or type"
                                className="pl-9"
                            />
                        </div>
                        <Button type="button" onClick={openNewPage}>
                            <Plus className="size-4" />
                            New page
                        </Button>
                    </div>
                </header>

                <div className="flex flex-col gap-3 border-b py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div
                        role="tablist"
                        aria-label="Filter pages by publishing status"
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
                                        filter === item.value && "bg-card text-foreground shadow-sm",
                                    )}
                                >
                                    {item.label}{" "}
                                    <span className="ml-1 tabular-nums">{count}</span>
                                </button>
                            );
                        })}
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Homepage first · then recently updated
                    </p>
                </div>

                <section className="py-6">
                    {visiblePages.length === 0 ? (
                        <div className="rounded-xl border border-dashed px-6 py-12 text-center">
                            <FilePlus2 className="mx-auto size-6 text-muted-foreground" />
                            <h2 className="mt-3 font-semibold">
                                {pages.length === 0 ? "Create your first page" : "No pages match"}
                            </h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                                {pages.length === 0
                                    ? "Build a page, then publish it when it is ready."
                                    : "Try another status, name, slug, or page type."}
                            </p>
                            {pages.length === 0 && (
                                <Button
                                    type="button"
                                    size="sm"
                                    className="mt-4"
                                    onClick={openNewPage}
                                >
                                    <Plus className="size-4" />
                                    New page
                                </Button>
                            )}
                        </div>
                    ) : (
                        <div className="divide-y overflow-hidden rounded-xl border bg-card">
                            {visiblePages.map((page) => (
                                <div
                                    key={page.pageId}
                                    className="group flex items-center gap-3 px-4 py-3.5 hover:bg-muted/35 sm:px-5"
                                >
                                    <Link
                                        href={`/editor/pages/${page.pageId}`}
                                        className="min-w-0 flex-1"
                                    >
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="truncate text-sm font-semibold group-hover:underline">
                                                {page.name}
                                            </span>
                                            {page.status !== "published" && (
                                                <DocumentStatusBadge status={page.status} />
                                            )}
                                            {!page.deleteable && (
                                                <Badge variant="outline" className="px-2 py-0.5">
                                                    Required
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
                                            <span className="truncate font-mono text-xs text-muted-foreground">
                                                {pagePath(page)}
                                            </span>
                                            <Badge
                                                variant="neutral"
                                                className="px-2 py-0.5 text-[0.6875rem] font-medium"
                                            >
                                                {PAGE_TYPE_LABELS[page.type]}
                                            </Badge>
                                        </div>
                                    </Link>
                                    <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                                        {relativeUpdatedAt(page.updatedAt)}
                                    </span>
                                    {page.deleteable && (
                                        <DeleteConfirm
                                            title={`Delete ${page.name}?`}
                                            description="This page and its published version will be permanently deleted."
                                            onConfirm={() => handleDelete(page)}
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>

            <Dialog open={newPageOpen} onOpenChange={setNewPageOpen}>
                <DialogContent>
                    <form onSubmit={handleCreate}>
                        <DialogHeader>
                            <DialogTitle>New page</DialogTitle>
                            <DialogDescription>
                                Choose the page purpose, then customize it in the builder.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="mt-5 space-y-4">
                            <div>
                                <Label htmlFor="page-name">Name</Label>
                                <Input
                                    id="page-name"
                                    name="name"
                                    autoComplete="off"
                                    autoFocus
                                    value={newPageName}
                                    onChange={(event) => {
                                        setNewPageName(event.target.value);
                                        if (createError) setCreateError(null);
                                    }}
                                    placeholder="Pricing"
                                    aria-invalid={Boolean(createError)}
                                    aria-describedby={createError ? "page-name-error" : undefined}
                                    className="mt-1"
                                    disabled={creating}
                                />
                                {createError && (
                                    <p
                                        id="page-name-error"
                                        role="alert"
                                        className="mt-1 text-sm text-destructive"
                                    >
                                        {createError}
                                    </p>
                                )}
                            </div>

                            <div>
                                <Label htmlFor="page-type">Page type</Label>
                                <Select
                                    name="type"
                                    value={newPageType}
                                    onValueChange={(value) => setNewPageType(value as PageType)}
                                    disabled={creating}
                                >
                                    <SelectTrigger id="page-type" className="mt-1">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {PAGE_TYPES.map((type) => (
                                            <SelectItem key={type} value={type}>
                                                {PAGE_TYPE_LABELS[type]}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {PAGE_TYPE_DESCRIPTIONS[newPageType]}
                                </p>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setNewPageOpen(false)}
                                disabled={creating}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={creating}>
                                {creating ? "Creating…" : "Create page"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </ScrollablePage>
    );
}
