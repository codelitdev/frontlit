"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EllipsisVertical, FileStack, GripVertical, Plus } from "lucide-react";
import { toast } from "sonner";
import { defaultTemplateEmail } from "@sendlit/email-blocks";
import { ApiError } from "@/lib/api-client";
import {
    type Broadcast,
    type NewsletterTemplate,
    createBroadcast,
    createNewsletterTemplate,
    getNewsletterSettings,
    listBroadcasts,
    listNewsletterTemplates,
} from "@/lib/api";
import { Loading } from "@/components/workspace/loading";
import { ScrollablePage } from "@/components/workspace/scrollable-page";
import { Banner } from "@/components/workspace/banner";
import { Button } from "@/components/ui/codelit/button";
import { IconButton } from "@/components/ui/codelit/icon-button";
import { Input } from "@/components/ui/codelit/input";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/codelit/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/codelit/dropdown-menu";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/codelit/select";
import { useSetBreadcrumb } from "@/components/workspace/breadcrumb-context";

function relativeDate(value: string | null | undefined, verb: string) {
    if (!value) return `${verb} recently`;
    const elapsed = Date.now() - new Date(value).getTime();
    const hours = Math.floor(elapsed / 3_600_000);
    if (hours < 1) return `${verb} just now`;
    if (hours < 24) return `${verb} ${hours}h ago`;
    if (hours < 48) return `${verb} yesterday`;
    return `${verb} ${new Date(value).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
    })}`;
}

function avatarLabel(name: string) {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((word) => word[0])
        .join("")
        .toUpperCase();
}

/** A compact SendLit-backed newsletter issue index. */
export default function NewsletterPage() {
    useSetBreadcrumb([{ label: "Newsletter" }]);
    const router = useRouter();
    const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
    const [templates, setTemplates] = useState<NewsletterTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [notConnected, setNotConnected] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [newIssueOpen, setNewIssueOpen] = useState(false);
    const [templatesOpen, setTemplatesOpen] = useState(false);
    const [newBroadcastName, setNewBroadcastName] = useState("");
    const [templateId, setTemplateId] = useState("system:blank");
    const [newTemplateName, setNewTemplateName] = useState("");

    const drafts = broadcasts.filter(
        (broadcast) => broadcast.status === "draft",
    );
    const pastIssues = broadcasts.filter(
        (broadcast) => broadcast.status !== "draft",
    );

    function newMarketingTemplateBody(): Record<string, unknown> {
        const document = JSON.parse(
            JSON.stringify(defaultTemplateEmail),
        ) as Record<string, any>;
        const content = Array.isArray(document.content) ? document.content : [];

        return {
            ...document,
            content: [
                ...content.filter(
                    (block: {
                        blockType?: string;
                        settings?: { content?: unknown };
                    }) => {
                        if (block.blockType === "footer") return false;
                        const text = block.settings?.content;
                        return !(
                            typeof text === "string" &&
                            (text.includes("{{address}}") ||
                                text.includes("{{unsubscribe_link}}"))
                        );
                    },
                ),
                {
                    blockType: "footer",
                    settings: {
                        alignment: "center",
                        fontFamily: "Arial, sans-serif",
                        fontSize: "12px",
                        foregroundColor: "#64748b",
                        backgroundColor: "transparent",
                        paddingTop: "16px",
                        paddingBottom: "16px",
                        paddingX: "24px",
                    },
                },
            ],
        };
    }

    function handleLoadError(err: unknown) {
        if (err instanceof ApiError && err.status === 409) {
            setNotConnected(true);
            return;
        }
        setLoadError(
            err instanceof ApiError
                ? err.message
                : "Failed to load newsletter data.",
        );
    }

    useEffect(() => {
        getNewsletterSettings()
            .then((settings) => {
                if (!settings.connected) {
                    setNotConnected(true);
                    return;
                }
                return Promise.all([
                    listBroadcasts(),
                    listNewsletterTemplates(),
                ])
                    .then(([broadcastResult, templateResult]) => {
                        setBroadcasts(broadcastResult.items);
                        setTemplates(templateResult.items);
                    })
                    .catch(handleLoadError);
            })
            .catch(handleLoadError)
            .finally(() => setLoading(false));
    }, []);

    async function handleCreateBroadcast(e: React.FormEvent) {
        e.preventDefault();
        if (!newBroadcastName.trim()) return;
        try {
            const created = await createBroadcast({
                name: newBroadcastName.trim(),
                ...(templateId === "system:blank" ? {} : { templateId }),
            });
            router.push(`/editor/newsletter/${created.broadcastId}`);
        } catch (err) {
            toast.error(
                err instanceof ApiError
                    ? err.message
                    : "Failed to create issue.",
            );
        }
    }

    async function handleCreateTemplate(e: React.FormEvent) {
        e.preventDefault();
        if (!newTemplateName.trim()) return;
        try {
            const created = await createNewsletterTemplate({
                title: newTemplateName.trim(),
                body: newMarketingTemplateBody(),
            });
            router.push(`/editor/newsletter/templates/${created.templateId}`);
        } catch (err) {
            toast.error(
                err instanceof ApiError
                    ? err.message
                    : "Failed to create template.",
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
            <div className="mx-auto w-full max-w-5xl space-y-7">
                <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-5">
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight">
                            Newsletter
                        </h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {drafts.length}{" "}
                            {drafts.length === 1 ? "draft" : "drafts"}
                            {" · "}
                            {pastIssues.length}{" "}
                            {pastIssues.length === 1
                                ? "sent issue"
                                : "sent issues"}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            onClick={() => setTemplatesOpen(true)}
                        >
                            <FileStack />
                            Manage templates
                        </Button>
                        <Button onClick={() => setNewIssueOpen(true)}>
                            <Plus />
                            New issue
                        </Button>
                    </div>
                </header>

                {notConnected && (
                    <Banner variant="warning">
                        This team isn&rsquo;t connected to SendLit yet.
                        Configure the email delivery connection in Settings
                        first.
                    </Banner>
                )}
                {loadError && <Banner>{loadError}</Banner>}

                {!notConnected && (
                    <>
                        <IssueSection
                            title="Drafts"
                            issues={drafts}
                            emptyLabel="No drafts yet. Create an issue to start writing."
                            isDraft
                        />
                        <IssueSection
                            title="Past issues"
                            issues={pastIssues}
                            emptyLabel="No issues have been sent yet."
                        />
                    </>
                )}
            </div>

            <Dialog open={newIssueOpen} onOpenChange={setNewIssueOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>New issue</DialogTitle>
                        <DialogDescription>
                            Start with a blank SendLit design or one of your
                            saved templates.
                        </DialogDescription>
                    </DialogHeader>
                    <form
                        onSubmit={handleCreateBroadcast}
                        className="mt-5 space-y-4"
                    >
                        <Input
                            autoFocus
                            value={newBroadcastName}
                            onChange={(event) =>
                                setNewBroadcastName(event.target.value)
                            }
                            placeholder="Issue name"
                        />
                        <Select
                            value={templateId}
                            onValueChange={setTemplateId}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Choose a template" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="system:blank">
                                    Blank starter
                                </SelectItem>
                                {templates.map((template) => (
                                    <SelectItem
                                        key={template.templateId}
                                        value={template.templateId}
                                    >
                                        {template.title}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <div className="flex justify-end gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setNewIssueOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button type="submit">Create issue</Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={templatesOpen} onOpenChange={setTemplatesOpen}>
                <DialogContent className="max-w-xl">
                    <DialogHeader>
                        <DialogTitle>Newsletter templates</DialogTitle>
                        <DialogDescription>
                            Reusable designs for new issues. Editing one does
                            not change existing drafts.
                        </DialogDescription>
                    </DialogHeader>
                    <form
                        onSubmit={handleCreateTemplate}
                        className="mt-5 flex gap-2"
                    >
                        <Input
                            value={newTemplateName}
                            onChange={(event) =>
                                setNewTemplateName(event.target.value)
                            }
                            placeholder="Template name"
                        />
                        <Button type="submit">New template</Button>
                    </form>
                    <div className="mt-4 divide-y rounded-[var(--radius)] border">
                        {templates.length === 0 && (
                            <p className="p-4 text-sm text-muted-foreground">
                                No saved templates yet.
                            </p>
                        )}
                        {templates.map((template) => (
                            <div
                                key={template.templateId}
                                className="flex items-center justify-between gap-3 p-3"
                            >
                                <p className="font-medium">{template.title}</p>
                                <Button asChild variant="outline" size="sm">
                                    <Link
                                        href={`/editor/newsletter/templates/${template.templateId}`}
                                    >
                                        Edit
                                    </Link>
                                </Button>
                            </div>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
        </ScrollablePage>
    );
}

function IssueSection({
    title,
    issues,
    emptyLabel,
    isDraft = false,
}: {
    title: string;
    issues: Broadcast[];
    emptyLabel: string;
    isDraft?: boolean;
}) {
    return (
        <section>
            <div className="mb-3 flex items-center gap-2 px-1">
                <h2 className="text-sm font-semibold">{title}</h2>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {issues.length}
                </span>
            </div>
            <div className="overflow-hidden rounded-xl border bg-card">
                {issues.length === 0 ? (
                    <p className="p-5 text-sm text-muted-foreground">
                        {emptyLabel}
                    </p>
                ) : (
                    issues.map((issue, index) => (
                        <IssueRow
                            key={issue.broadcastId}
                            issue={issue}
                            isDraft={isDraft}
                            bordered={index > 0}
                        />
                    ))
                )}
            </div>
        </section>
    );
}

function IssueRow({
    issue,
    isDraft,
    bordered,
}: {
    issue: Broadcast;
    isDraft: boolean;
    bordered: boolean;
}) {
    return (
        <div
            className={`flex min-h-17 items-center gap-3 px-3 py-3 ${bordered ? "border-t" : ""}`}
        >
            <GripVertical className="size-4 shrink-0 text-muted-foreground/60" />
            <div className="min-w-0 flex-1">
                {isDraft ? (
                    <Link
                        href={`/editor/newsletter/${issue.broadcastId}`}
                        className="font-medium hover:underline"
                    >
                        {issue.name}
                    </Link>
                ) : (
                    <p className="font-medium">{issue.name}</p>
                )}
                <p className="mt-1 text-sm text-muted-foreground">
                    {relativeDate(
                        isDraft
                            ? (issue.updatedAt ?? issue.createdAt)
                            : issue.createdAt,
                        isDraft ? "Edited" : "Sent",
                    )}
                </p>
            </div>
            <span
                className={
                    isDraft
                        ? "rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
                        : "inline-flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-1 text-xs font-medium text-success"
                }
            >
                {!isDraft && (
                    <span className="size-1.5 rounded-full bg-success" />
                )}
                {isDraft ? "Draft" : "Sent"}
            </span>
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                {avatarLabel(issue.name)}
            </span>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <IconButton
                        aria-label={`Actions for ${issue.name}`}
                        size="sm"
                    >
                        <EllipsisVertical />
                    </IconButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    {isDraft ? (
                        <DropdownMenuItem asChild>
                            <Link
                                href={`/editor/newsletter/${issue.broadcastId}`}
                            >
                                Edit issue
                            </Link>
                        </DropdownMenuItem>
                    ) : (
                        <DropdownMenuItem disabled>
                            Delivered issue
                        </DropdownMenuItem>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
