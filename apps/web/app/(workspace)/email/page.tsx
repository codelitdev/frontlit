"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EllipsisVertical, Plus } from "lucide-react";
import { toast } from "sonner";
import {
    defaultTemplateEmail,
    TemplateChooser,
    type Email,
    type EmailTemplate as ChooserEmailTemplate,
    type SystemTemplateSummary,
} from "@sendlit/email-blocks";
import { ApiError } from "@/lib/api-client";
import {
    type Broadcast,
    type EmailTemplate,
    createBroadcast,
    createEmailTemplate,
    deleteBroadcast,
    getEmailSettings,
    listBroadcasts,
    listEmailTemplates,
    listSystemEmailTemplates,
    type SystemEmailTemplate,
} from "@/lib/api";
import { emailTabHref, parseEmailTab, type EmailTab } from "@/lib/email-tabs";
import { EmailTabs } from "@/components/email/email-tabs";
import { DeleteConfirm } from "@/components/workspace/delete-confirm";
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

function newMarketingTemplateBody(): Record<string, unknown> {
    const document = JSON.parse(JSON.stringify(defaultTemplateEmail)) as Record<
        string,
        any
    >;
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

/** SendLit-backed email workspace: broadcasts and reusable templates. */
export default function EmailPage({
    searchParams,
}: {
    searchParams: Promise<{ tab?: string | string[] }>;
}) {
    const router = useRouter();
    const query = use(searchParams);
    const requested = Array.isArray(query.tab) ? query.tab[0] : query.tab;
    const tab = parseEmailTab(query.tab);

    useEffect(() => {
        if (requested !== tab) {
            router.replace(emailTabHref(tab));
        }
    }, [requested, router, tab]);

    return <EmailWorkspace tab={tab} />;
}

function EmailWorkspace({ tab }: { tab: EmailTab }) {
    useSetBreadcrumb([
        { label: "Email", href: emailTabHref("broadcasts") },
        { label: tab === "templates" ? "Templates" : "Broadcasts" },
    ]);
    const router = useRouter();
    const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
    const [templates, setTemplates] = useState<EmailTemplate[]>([]);
    const [systemTemplates, setSystemTemplates] = useState<
        SystemEmailTemplate[]
    >([]);
    const [loading, setLoading] = useState(true);
    const [notConnected, setNotConnected] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [newBroadcastOpen, setNewBroadcastOpen] = useState(false);
    const [newBroadcastName, setNewBroadcastName] = useState("");
    const [templateId, setTemplateId] = useState("system:blank");
    const [newTemplateOpen, setNewTemplateOpen] = useState(false);
    const [newTemplateName, setNewTemplateName] = useState("");

    const drafts = broadcasts.filter(
        (broadcast) => broadcast.status === "draft",
    );
    const sent = broadcasts.filter((broadcast) => broadcast.status !== "draft");

    function handleLoadError(err: unknown) {
        if (err instanceof ApiError && err.status === 409) {
            setNotConnected(true);
            return;
        }
        setLoadError(
            err instanceof ApiError
                ? err.message
                : "Failed to load email data.",
        );
    }

    useEffect(() => {
        getEmailSettings()
            .then((settings) => {
                if (!settings.connected) {
                    setNotConnected(true);
                    return;
                }
                return Promise.all([
                    listBroadcasts(),
                    listEmailTemplates(),
                    listSystemEmailTemplates(),
                ])
                    .then(
                        ([
                            broadcastResult,
                            templateResult,
                            systemTemplateResult,
                        ]) => {
                            setBroadcasts(broadcastResult.items);
                            setTemplates(templateResult.items);
                            setSystemTemplates(systemTemplateResult.items);
                        },
                    )
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
            router.push(`/editor/email/${created.broadcastId}`);
        } catch (err) {
            toast.error(
                err instanceof ApiError
                    ? err.message
                    : "Failed to create broadcast.",
            );
        }
    }

    async function handleCreateTemplate(e: React.FormEvent) {
        e.preventDefault();
        if (!newTemplateName.trim()) return;
        try {
            const created = await createEmailTemplate({
                title: newTemplateName.trim(),
                body: newMarketingTemplateBody(),
            });
            router.push(`/editor/email/templates/${created.templateId}`);
        } catch (err) {
            toast.error(
                err instanceof ApiError
                    ? err.message
                    : "Failed to create template.",
            );
        }
    }

    async function handleChooseTemplate(choice: {
        templateId: string;
        title: string;
    }) {
        const existing = templates.find(
            (template) => template.templateId === choice.templateId,
        );
        if (existing) {
            router.push(`/editor/email/templates/${existing.templateId}`);
            return;
        }

        const system = systemTemplates.find(
            (template) => template.templateId === choice.templateId,
        );
        if (!system) return;
        try {
            const created = await createEmailTemplate({
                title: system.title,
                body: system.body,
            });
            router.push(`/editor/email/templates/${created.templateId}`);
        } catch (err) {
            toast.error(
                err instanceof ApiError
                    ? err.message
                    : "Failed to create template.",
            );
        }
    }

    async function handleDeleteBroadcast(broadcast: Broadcast) {
        try {
            await deleteBroadcast(broadcast.broadcastId);
            setBroadcasts((current) =>
                current.filter(
                    (item) => item.broadcastId !== broadcast.broadcastId,
                ),
            );
            toast.success("Broadcast deleted.");
        } catch (err) {
            toast.error(
                err instanceof ApiError
                    ? err.message
                    : "Failed to delete broadcast.",
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
                <EmailTabs currentTab={tab} />
                <header className="mb-7 flex flex-col gap-5 border-b pb-5 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight">
                            {tab === "templates" ? "Templates" : "Broadcasts"}
                        </h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {tab === "templates"
                                ? "Reusable designs for new broadcasts."
                                : "Draft and send broadcasts through SendLit."}
                        </p>
                    </div>
                    {tab === "broadcasts" ? (
                        <Button onClick={() => setNewBroadcastOpen(true)}>
                            <Plus />
                            New broadcast
                        </Button>
                    ) : (
                        <Button
                            onClick={() => {
                                setNewTemplateName("");
                                setNewTemplateOpen(true);
                            }}
                        >
                            <Plus />
                            New template
                        </Button>
                    )}
                </header>

                <div className="space-y-7">
                    {notConnected && (
                        <Banner variant="warning">
                            Configure the email delivery connection in Settings
                            first.
                        </Banner>
                    )}
                    {loadError && <Banner>{loadError}</Banner>}

                    {!notConnected && tab === "broadcasts" && (
                        <div className="space-y-7">
                            <BroadcastSection
                                title="Drafts"
                                issues={drafts}
                                emptyLabel="No drafts yet. Create a broadcast to start writing."
                                isDraft
                                onDelete={handleDeleteBroadcast}
                            />
                            <BroadcastSection
                                title="Sent"
                                issues={sent}
                                emptyLabel="No broadcasts have been sent yet."
                                onDelete={handleDeleteBroadcast}
                            />
                        </div>
                    )}

                    {!notConnected && tab === "templates" && (
                        <TemplateChooser
                            systemTemplates={systemTemplates.map(
                                (template): SystemTemplateSummary => ({
                                    templateId: template.templateId,
                                    title: template.title,
                                    description: template.description ?? "",
                                    content: template.body as unknown as Email,
                                }),
                            )}
                            templates={templates.map(
                                (template): ChooserEmailTemplate => ({
                                    id: template.templateId,
                                    teamId: "",
                                    templateId: template.templateId,
                                    title: template.title,
                                    content: template.body as unknown as Email,
                                    createdAt: template.createdAt ?? "",
                                    updatedAt: template.updatedAt ?? "",
                                }),
                            )}
                            onSelect={(choice) => {
                                void handleChooseTemplate(choice);
                            }}
                        />
                    )}
                </div>
            </div>

            <Dialog open={newBroadcastOpen} onOpenChange={setNewBroadcastOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>New broadcast</DialogTitle>
                        <DialogDescription>
                            Start with a blank design or one of your saved
                            templates. You can choose the audience in the editor
                            before sending.
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
                            placeholder="Broadcast name"
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
                                onClick={() => setNewBroadcastOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button type="submit">Create broadcast</Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={newTemplateOpen} onOpenChange={setNewTemplateOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>New template</DialogTitle>
                        <DialogDescription>
                            Create a reusable design. Editing it later does not
                            change existing broadcasts.
                        </DialogDescription>
                    </DialogHeader>
                    <form
                        onSubmit={handleCreateTemplate}
                        className="mt-5 space-y-4"
                    >
                        <Input
                            autoFocus
                            value={newTemplateName}
                            onChange={(event) =>
                                setNewTemplateName(event.target.value)
                            }
                            placeholder="Template name"
                        />
                        <div className="flex justify-end gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setNewTemplateOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button type="submit">Create template</Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </ScrollablePage>
    );
}

function BroadcastSection({
    title,
    issues,
    emptyLabel,
    isDraft = false,
    onDelete,
}: {
    title: string;
    issues: Broadcast[];
    emptyLabel: string;
    isDraft?: boolean;
    onDelete: (broadcast: Broadcast) => Promise<void>;
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
                        <BroadcastRow
                            key={issue.broadcastId}
                            issue={issue}
                            isDraft={isDraft}
                            bordered={index > 0}
                            onDelete={onDelete}
                        />
                    ))
                )}
            </div>
        </section>
    );
}

function BroadcastRow({
    issue,
    isDraft,
    bordered,
    onDelete,
}: {
    issue: Broadcast;
    isDraft: boolean;
    bordered: boolean;
    onDelete: (broadcast: Broadcast) => Promise<void>;
}) {
    const [deleteOpen, setDeleteOpen] = useState(false);

    return (
        <div
            className={`group flex items-center gap-3 px-4 py-3.5 hover:bg-muted/35 sm:px-5 ${bordered ? "border-t" : ""}`}
        >
            <div className="min-w-0 flex-1">
                {isDraft ? (
                    <Link
                        href={`/editor/email/${issue.broadcastId}`}
                        className="truncate text-sm font-semibold hover:underline"
                    >
                        {issue.name}
                    </Link>
                ) : (
                    <p className="truncate text-sm font-semibold">
                        {issue.name}
                    </p>
                )}
                <p className="mt-1 truncate text-xs text-muted-foreground">
                    {relativeDate(
                        isDraft
                            ? (issue.updatedAt ?? issue.createdAt)
                            : issue.createdAt,
                        isDraft ? "Edited" : "Sent",
                    )}
                </p>
            </div>
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
                            <Link href={`/editor/email/${issue.broadcastId}`}>
                                Edit broadcast
                            </Link>
                        </DropdownMenuItem>
                    ) : (
                        <DropdownMenuItem disabled>
                            Delivered broadcast
                        </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => setDeleteOpen(true)}
                    >
                        Delete
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            <DeleteConfirm
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                trigger={null}
                title={`Delete ${issue.name}?`}
                description="This broadcast will be permanently deleted from SendLit."
                onConfirm={() => onDelete(issue)}
            />
        </div>
    );
}
