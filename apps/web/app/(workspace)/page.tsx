"use client";

import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    Bot,
    Check,
    Clock3,
    Inbox,
    Loader2,
    Paperclip,
    Search,
    Send,
    X,
} from "lucide-react";
import { toast } from "sonner";
import { TextRenderer } from "@frontlit/text-editor";
import type { TextEditorContent } from "@frontlit/text-editor";
import {
    completeTicketAttachment,
    getChatbotSettings,
    getTicket,
    listTickets,
    replyToTicket,
    updateTicket,
    type Ticket,
    type TicketAiOptics,
    type TicketAttachment,
    type TicketMessage,
    type TicketStatus,
    type TicketWithMessages,
} from "@/lib/api";
import { useMediaLit } from "@/lib/use-medialit";
import { ApiError } from "@/lib/api-client";
import { useInboxLive } from "@/lib/use-inbox-live";
import { Button } from "@/components/ui/codelit/button";
import { useSetBreadcrumb } from "@/components/workspace/breadcrumb-context";
import { useWorkspaceAccess } from "@/components/workspace/workspace-access";
import { cn } from "@/lib/utils";

type InboxFilter = "open" | "done";

function isOpen(status: TicketStatus) {
    return status === "open" || status === "pending";
}

function requesterLabel(ticket: Ticket) {
    if (ticket.requesterName) return ticket.requesterName;
    if (ticket.requesterEmail) return ticket.requesterEmail;
    return ticket.source === "chatbot"
        ? "Website visitor"
        : "Support requester";
}

function sourceLabel(ticket: Ticket) {
    if (ticket.source === "chatbot") return "Chat";
    if (ticket.source === "form") return "Support";
    if (ticket.source === "email") return "Email";
    return "API";
}

function initials(label: string) {
    const parts = label.trim().split(/\s+/).filter(Boolean);
    return (
        parts.length > 1
            ? `${parts[0][0]}${parts[1][0]}`
            : parts[0]?.slice(0, 2) || "?"
    ).toUpperCase();
}

function relativeTime(value: string | null) {
    if (!value) return "";
    const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
    const minutes = Math.floor(elapsed / 60_000);
    if (minutes < 1) return "now";
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    return new Date(value).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
    });
}

function isImageMime(mime: string) {
    return mime.startsWith("image/");
}

function formatBytes(size: number) {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function aiStopLabel(reason: string | null | undefined, retrievalCount = 0) {
    switch (reason) {
        case "visitor_request":
            return "The visitor asked for a human";
        case "empty_retrieval":
            return "No help articles passed the 25% match floor";
        case "unsure":
            return retrievalCount > 0
                ? "The model was unsure the retrieved articles answered the question"
                : "No help articles passed the 25% match floor";
        case "topic":
            return "Matched an escalation topic";
        case "turn_cap":
            return "Reached the bot turn limit";
        case "agent_takeover":
            return "A teammate took over";
        default:
            return reason || "AI activity";
    }
}

function TicketAiPanel({ ai }: { ai: TicketAiOptics }) {
    const latest = [...ai.runs].reverse()[0];
    return (
        <div className="mx-auto mb-6 max-w-4xl rounded-xl border bg-background px-4 py-3 text-xs">
            <div className="flex items-center gap-2 font-medium text-foreground">
                <Bot className="size-3.5" />
                AI
                <span className="font-normal text-muted-foreground">
                    {ai.state === "escalated"
                        ? `Escalated · ${aiStopLabel(ai.stopReason, latest?.retrieval.length ?? 0)}`
                        : ai.state === "taken_over"
                          ? `Handed to a teammate · ${aiStopLabel(ai.stopReason, latest?.retrieval.length ?? 0)}`
                          : ai.state === "waiting"
                            ? "Waiting on the visitor"
                            : "Idle"}
                </span>
            </div>
            {latest && (
                <div className="mt-2 space-y-1 text-muted-foreground">
                    {latest.stopReason &&
                        latest.stopReason !== ai.stopReason && (
                            <p>
                                {aiStopLabel(
                                    latest.stopReason,
                                    latest.retrieval.length,
                                )}
                            </p>
                        )}
                    {latest.lastError && (
                        <p className="text-destructive">
                            Provider error: {latest.lastError}
                        </p>
                    )}
                    {latest.retrieval.length > 0 ? (
                        <div>
                            <p className="mb-1 font-medium text-foreground/80">
                                Docs retrieved
                            </p>
                            <ul className="flex flex-col gap-0.5">
                                {latest.retrieval.map((hit, index) => (
                                    <li
                                        key={`${hit.documentId}-${hit.anchor ?? ""}-${index}`}
                                    >
                                        <a
                                            href={`/editor/content/documentation/${hit.documentId}`}
                                            className="text-primary underline-offset-2 hover:underline"
                                        >
                                            {hit.title ?? hit.slug}
                                            {hit.heading
                                                ? ` — ${hit.heading}`
                                                : ""}
                                        </a>
                                        {typeof hit.similarity === "number" && (
                                            <span className="ml-1 text-muted-foreground">
                                                (
                                                {Math.round(
                                                    hit.similarity * 100,
                                                )}
                                                %)
                                            </span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : (
                        <p>
                            No help articles were retrieved for the last turn.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

function MessageCitations({ sources }: { sources?: TicketMessage["sources"] }) {
    if (!sources?.length) return null;
    const unique = sources.filter(
        (source, index, list) =>
            list.findIndex((item) => item.documentId === source.documentId) ===
            index,
    );
    return (
        <div className="mt-2 border-t border-primary/10 pt-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Sources
            </p>
            <ol className="mt-1 flex flex-col gap-0.5 text-xs">
                {unique.map((source, index) => (
                    <li key={source.documentId}>
                        <a
                            href={`/editor/content/documentation/${source.documentId}`}
                            className="text-primary underline-offset-2 hover:underline"
                        >
                            [{index + 1}] {source.title ?? source.slug}
                        </a>
                    </li>
                ))}
            </ol>
        </div>
    );
}

function MessageAttachments({
    attachments,
    align,
}: {
    attachments: TicketAttachment[];
    align: "start" | "end";
}) {
    if (!attachments.length) return null;
    return (
        <div
            className={cn(
                "mt-2 flex flex-col gap-2",
                align === "end" && "items-end",
            )}
        >
            {attachments.map((file) =>
                isImageMime(file.mimeType) ? (
                    <a
                        key={file.attachmentId}
                        href={file.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block overflow-hidden rounded-lg border bg-background"
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={file.thumbnailUrl || file.url}
                            alt={file.fileName}
                            className="max-h-56 max-w-full object-contain"
                        />
                    </a>
                ) : (
                    <a
                        key={file.attachmentId}
                        href={file.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex max-w-full items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs hover:bg-muted"
                    >
                        <Paperclip className="size-3.5 shrink-0" />
                        <span className="truncate">{file.fileName}</span>
                        <span className="shrink-0 text-muted-foreground">
                            {formatBytes(file.size)}
                        </span>
                    </a>
                ),
            )}
        </div>
    );
}

function textContent(text: string): TextEditorContent {
    return {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    };
}

export default function InboxPage() {
    useSetBreadcrumb([{ label: "Inbox" }]);
    const { currentTeamId } = useWorkspaceAccess();

    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [filter, setFilter] = useState<InboxFilter>("open");
    const [query, setQuery] = useState("");
    const [selectedTicketId, setSelectedTicketId] = useState<string | null>(
        null,
    );
    const [selectedTicket, setSelectedTicket] =
        useState<TicketWithMessages | null>(null);
    const [reply, setReply] = useState("");
    const [loading, setLoading] = useState(true);
    const [loadingThread, setLoadingThread] = useState(false);
    const [sending, setSending] = useState(false);
    const [updating, setUpdating] = useState(false);
    const [assistantName, setAssistantName] = useState("Assistant");
    const threadRef = useRef<HTMLDivElement>(null);
    const stickToBottomRef = useRef(true);
    const lastThreadIdRef = useRef<string | null>(null);
    const [pendingFiles, setPendingFiles] = useState<TicketAttachment[]>([]);
    const [attaching, setAttaching] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const { uploadFile } = useMediaLit({
        signatureEndpoint: selectedTicket
            ? `/api/proxy/tickets/${selectedTicket.ticketId}/attachments/presign`
            : "/api/proxy/media/presigned",
        access: "private",
    });

    const loadInbox = useCallback(async () => {
        try {
            const result = await listTickets({ itemsPerPage: 100 });
            setTickets(result.items);
        } catch (error) {
            toast.error(
                error instanceof ApiError
                    ? error.message
                    : "Failed to load the inbox.",
            );
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadInbox();
    }, [loadInbox]);

    useEffect(() => {
        setPendingFiles([]);
    }, [selectedTicketId]);

    useEffect(() => {
        getChatbotSettings()
            .then((settings) => {
                if (settings.name.trim())
                    setAssistantName(settings.name.trim());
            })
            .catch(() => {});
    }, []);

    const onLiveUpdate = useCallback(
        (ticketId: string) => {
            void loadInbox();
            if (ticketId === selectedTicketId && !sending) {
                getTicket(ticketId)
                    .then(setSelectedTicket)
                    .catch(() => {
                        // List refresh still ran; thread can be opened again.
                    });
            }
        },
        [loadInbox, selectedTicketId, sending],
    );
    useInboxLive(onLiveUpdate, currentTeamId);

    const lastMessageId =
        selectedTicket?.messages[selectedTicket.messages.length - 1]
            ?.messageId ?? null;

    useLayoutEffect(() => {
        const el = threadRef.current;
        if (!el || !selectedTicketId) return;
        const switched = lastThreadIdRef.current !== selectedTicketId;
        lastThreadIdRef.current = selectedTicketId;
        if (switched) stickToBottomRef.current = true;
        if (!switched && !stickToBottomRef.current) return;
        el.scrollTop = el.scrollHeight;
        requestAnimationFrame(() => {
            if (threadRef.current) {
                threadRef.current.scrollTop = threadRef.current.scrollHeight;
            }
        });
    }, [selectedTicketId, lastMessageId, selectedTicket?.messages.length]);

    const visibleTickets = useMemo(() => {
        const normalizedQuery = query.trim().toLocaleLowerCase();
        return tickets.filter((ticket) => {
            if (
                filter === "open"
                    ? !isOpen(ticket.status)
                    : isOpen(ticket.status)
            )
                return false;
            if (!normalizedQuery) return true;
            return [
                ticket.subject,
                requesterLabel(ticket),
                ticket.requesterEmail,
                sourceLabel(ticket),
            ]
                .filter(Boolean)
                .some((value) =>
                    value!.toLocaleLowerCase().includes(normalizedQuery),
                );
        });
    }, [filter, query, tickets]);

    useEffect(() => {
        if (
            !visibleTickets.some(
                (ticket) => ticket.ticketId === selectedTicketId,
            )
        ) {
            setSelectedTicketId(visibleTickets[0]?.ticketId ?? null);
        }
    }, [selectedTicketId, visibleTickets]);

    useEffect(() => {
        if (!selectedTicketId) {
            setSelectedTicket(null);
            return;
        }

        let cancelled = false;
        setLoadingThread(true);
        getTicket(selectedTicketId)
            .then((ticket) => {
                if (!cancelled) setSelectedTicket(ticket);
            })
            .catch((error) => {
                if (!cancelled)
                    toast.error(
                        error instanceof ApiError
                            ? error.message
                            : "Failed to load the conversation.",
                    );
            })
            .finally(() => {
                if (!cancelled) setLoadingThread(false);
            });
        return () => {
            cancelled = true;
        };
    }, [selectedTicketId]);

    async function changeStatus(status: TicketStatus) {
        if (!selectedTicket || updating) return;
        setUpdating(true);
        try {
            const updated = await updateTicket(selectedTicket.ticketId, {
                status,
            });
            setTickets((current) =>
                current.map((ticket) =>
                    ticket.ticketId === updated.ticketId ? updated : ticket,
                ),
            );
            setSelectedTicket((current) =>
                current ? { ...current, ...updated } : current,
            );
        } catch (error) {
            toast.error(
                error instanceof ApiError
                    ? error.message
                    : "Failed to update the conversation.",
            );
        } finally {
            setUpdating(false);
        }
    }

    async function attachInboxFiles(list: FileList | null) {
        if (!selectedTicket || !list?.length) return;
        setAttaching(true);
        try {
            const added: TicketAttachment[] = [];
            for (const file of Array.from(list).slice(0, 5)) {
                const uploaded = await uploadFile(file);
                const mediaLitId =
                    typeof uploaded.mediaId === "string"
                        ? uploaded.mediaId
                        : typeof uploaded.id === "string"
                          ? uploaded.id
                          : "";
                if (!mediaLitId) continue;
                added.push(
                    await completeTicketAttachment(
                        selectedTicket.ticketId,
                        mediaLitId,
                        {
                            fileName: file.name,
                            mimeType: file.type,
                            size: file.size,
                        },
                    ),
                );
            }
            setPendingFiles((current) => [...current, ...added].slice(0, 5));
        } catch (error) {
            toast.error(
                error instanceof ApiError
                    ? error.message
                    : "Failed to attach the file.",
            );
        } finally {
            setAttaching(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    }

    async function sendReply() {
        const message = reply.trim();
        if (
            !selectedTicket ||
            sending ||
            (!message && pendingFiles.length === 0)
        )
            return;
        stickToBottomRef.current = true;
        setSending(true);
        try {
            const updated = await replyToTicket(
                selectedTicket.ticketId,
                textContent(message || "Sent an attachment"),
                pendingFiles.map((file) => file.attachmentId),
            );
            setSelectedTicket(updated);
            setTickets((current) =>
                current.map((ticket) =>
                    ticket.ticketId === updated.ticketId
                        ? { ...ticket, ...updated }
                        : ticket,
                ),
            );
            setReply("");
            setPendingFiles([]);
        } catch (error) {
            toast.error(
                error instanceof ApiError
                    ? error.message
                    : "Failed to send the reply.",
            );
        } finally {
            setSending(false);
        }
    }

    const openCount = tickets.filter((ticket) => isOpen(ticket.status)).length;

    return (
        <div className="grid h-full min-h-0 grid-cols-[minmax(19rem,23rem)_minmax(30rem,1fr)] overflow-hidden">
            <section className="flex min-h-0 min-w-0 flex-col overflow-hidden border-r bg-background">
                <div className="border-b px-5 pb-3 pt-4">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <h1 className="text-2xl font-semibold tracking-tight">
                                Inbox
                            </h1>
                            {openCount > 0 && (
                                <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                                    {openCount}
                                </span>
                            )}
                        </div>
                        <div className="flex rounded-lg bg-muted p-1 text-sm">
                            {(["open", "done"] as const).map((value) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => setFilter(value)}
                                    className={cn(
                                        "rounded-md px-3 py-1.5 capitalize transition-colors",
                                        filter === value
                                            ? "bg-background font-medium shadow-sm"
                                            : "text-muted-foreground hover:text-foreground",
                                    )}
                                >
                                    {value}
                                </button>
                            ))}
                        </div>
                    </div>
                    <label className="mt-4 flex h-11 items-center gap-2 rounded-lg border bg-background px-3 focus-within:ring-2 focus-within:ring-ring/40">
                        <Search className="size-4 text-muted-foreground" />
                        <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search conversations…"
                            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                        />
                    </label>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="flex h-32 items-center justify-center text-muted-foreground">
                            <Loader2 className="size-5 animate-spin" />
                        </div>
                    ) : visibleTickets.length === 0 ? (
                        <div className="flex h-full min-h-56 flex-col items-center justify-center px-8 text-center">
                            <Inbox className="mb-3 size-8 text-muted-foreground/60" />
                            <p className="font-medium">
                                No {filter} conversations
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                                {query
                                    ? "Try a different search."
                                    : filter === "open"
                                      ? "New chats and support tickets will appear here."
                                      : "Completed conversations will appear here."}
                            </p>
                        </div>
                    ) : (
                        visibleTickets.map((ticket) => {
                            const label = requesterLabel(ticket);
                            return (
                                <button
                                    key={ticket.ticketId}
                                    type="button"
                                    onClick={() =>
                                        setSelectedTicketId(ticket.ticketId)
                                    }
                                    className={cn(
                                        "relative w-full border-b px-5 py-4 text-left transition-colors hover:bg-muted/60",
                                        selectedTicketId === ticket.ticketId &&
                                            "bg-primary/10 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-primary",
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <p className="truncate text-sm font-semibold">
                                            {label}
                                        </p>
                                        <span className="shrink-0 text-xs text-muted-foreground">
                                            {relativeTime(ticket.lastMessageAt)}
                                        </span>
                                    </div>
                                    <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                                        {ticket.source === "chatbot" && (
                                            <Bot className="size-3" />
                                        )}
                                        <span>{sourceLabel(ticket)}</span>
                                        {ticket.requesterEmail && (
                                            <span className="truncate">
                                                · {ticket.requesterEmail}
                                            </span>
                                        )}
                                        {ticket.status === "pending" && (
                                            <span className="ml-auto rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                                                Waiting on customer
                                            </span>
                                        )}
                                    </div>
                                    <p className="mt-2 truncate text-sm text-foreground/80">
                                        {ticket.subject}
                                    </p>
                                </button>
                            );
                        })
                    )}
                </div>
            </section>

            <section className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-muted/20">
                {!selectedTicketId ? (
                    <div className="flex h-full flex-col items-center justify-center text-center">
                        <Inbox className="mb-3 size-10 text-muted-foreground/40" />
                        <p className="font-medium">Select a conversation</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Chat messages and support tickets share one inbox.
                        </p>
                    </div>
                ) : loadingThread && !selectedTicket ? (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                        <Loader2 className="size-6 animate-spin" />
                    </div>
                ) : selectedTicket ? (
                    <>
                        <header className="flex min-h-20 shrink-0 items-center justify-between gap-4 border-b bg-background px-7 py-3">
                            <div className="flex min-w-0 items-center gap-3">
                                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                                    {initials(requesterLabel(selectedTicket))}
                                </div>
                                <div className="min-w-0">
                                    <p className="truncate font-semibold">
                                        {requesterLabel(selectedTicket)}
                                    </p>
                                    <p className="truncate text-sm text-muted-foreground">
                                        {selectedTicket.status === "pending"
                                            ? "Waiting on customer"
                                            : selectedTicket.status === "open"
                                              ? "Needs reply"
                                              : selectedTicket.status ===
                                                  "resolved"
                                                ? "Done"
                                                : "Closed"}
                                        {" · "}
                                        {sourceLabel(selectedTicket)}
                                        {selectedTicket.requesterEmail
                                            ? ` · ${selectedTicket.requesterEmail}`
                                            : " · Anonymous visitor"}
                                    </p>
                                </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                {isOpen(selectedTicket.status) ? (
                                    <>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={updating}
                                            onClick={() =>
                                                void changeStatus(
                                                    selectedTicket.status ===
                                                        "pending"
                                                        ? "open"
                                                        : "pending",
                                                )
                                            }
                                        >
                                            <Clock3 className="size-4" />
                                            {selectedTicket.status === "pending"
                                                ? "Mark as needs reply"
                                                : "Mark as waiting"}
                                        </Button>
                                        <Button
                                            size="sm"
                                            disabled={updating}
                                            onClick={() =>
                                                void changeStatus("resolved")
                                            }
                                        >
                                            <Check className="size-4" />
                                            Mark done
                                        </Button>
                                    </>
                                ) : (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={updating}
                                        onClick={() =>
                                            void changeStatus("open")
                                        }
                                    >
                                        Reopen
                                    </Button>
                                )}
                            </div>
                        </header>

                        <div
                            ref={threadRef}
                            onScroll={() => {
                                const el = threadRef.current;
                                if (!el) return;
                                stickToBottomRef.current =
                                    el.scrollHeight -
                                        el.scrollTop -
                                        el.clientHeight <
                                    80;
                            }}
                            className="min-h-0 flex-1 space-y-5 overflow-y-auto px-7 py-6"
                        >
                            <div className="mx-auto max-w-4xl">
                                <p className="mb-6 text-center text-xs text-muted-foreground">
                                    {selectedTicket.subject} ·{" "}
                                    {selectedTicket.createdAt
                                        ? new Date(
                                              selectedTicket.createdAt,
                                          ).toLocaleString()
                                        : ""}
                                </p>
                                {selectedTicket.ai && (
                                    <TicketAiPanel ai={selectedTicket.ai} />
                                )}
                                <div className="space-y-5">
                                    {selectedTicket.messages.map((message) => {
                                        const isRequester =
                                            message.author === "requester";
                                        return (
                                            <div
                                                key={message.messageId}
                                                className={cn(
                                                    "flex",
                                                    isRequester
                                                        ? "justify-start"
                                                        : "justify-end",
                                                )}
                                            >
                                                <div className="max-w-[76%]">
                                                    <div
                                                        className={cn(
                                                            "rounded-2xl px-4 py-3 text-sm shadow-sm",
                                                            isRequester
                                                                ? "rounded-tl-sm bg-background"
                                                                : message.author ===
                                                                    "bot"
                                                                  ? "rounded-tr-sm border border-primary/20 bg-primary/5"
                                                                  : "rounded-tr-sm bg-primary text-primary-foreground",
                                                        )}
                                                    >
                                                        <TextRenderer
                                                            json={
                                                                message.content
                                                            }
                                                        />
                                                        <MessageAttachments
                                                            attachments={
                                                                message.attachments ??
                                                                []
                                                            }
                                                            align={
                                                                isRequester
                                                                    ? "start"
                                                                    : "end"
                                                            }
                                                        />
                                                        {message.author ===
                                                            "bot" && (
                                                            <MessageCitations
                                                                sources={
                                                                    message.sources
                                                                }
                                                            />
                                                        )}
                                                    </div>
                                                    <p
                                                        className={cn(
                                                            "mt-1.5 text-xs text-muted-foreground",
                                                            !isRequester &&
                                                                "text-right",
                                                        )}
                                                    >
                                                        {message.author ===
                                                        "requester"
                                                            ? requesterLabel(
                                                                  selectedTicket,
                                                              )
                                                            : message.author ===
                                                                "bot"
                                                              ? assistantName
                                                              : "Support agent"}
                                                        {message.createdAt
                                                            ? ` · ${new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                                                            : ""}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="shrink-0 border-t bg-background p-4">
                            {pendingFiles.length > 0 && (
                                <div className="mx-auto mb-2 flex max-w-4xl flex-wrap gap-2">
                                    {pendingFiles.map((file) => (
                                        <span
                                            key={file.attachmentId}
                                            className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-1 text-xs"
                                        >
                                            <Paperclip className="size-3" />
                                            <span className="max-w-40 truncate">
                                                {file.fileName}
                                            </span>
                                            <button
                                                type="button"
                                                aria-label={`Remove ${file.fileName}`}
                                                onClick={() =>
                                                    setPendingFiles((current) =>
                                                        current.filter(
                                                            (item) =>
                                                                item.attachmentId !==
                                                                file.attachmentId,
                                                        ),
                                                    )
                                                }
                                            >
                                                <X className="size-3" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                            <div className="mx-auto flex max-w-4xl items-end gap-2">
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    multiple
                                    className="hidden"
                                    onChange={(event) =>
                                        void attachInboxFiles(
                                            event.target.files,
                                        )
                                    }
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="md"
                                    className="size-11 rounded-xl"
                                    disabled={sending || attaching}
                                    onClick={() =>
                                        fileInputRef.current?.click()
                                    }
                                    aria-label="Attach a file"
                                >
                                    {attaching ? (
                                        <Loader2 className="size-4 animate-spin" />
                                    ) : (
                                        <Paperclip className="size-4" />
                                    )}
                                </Button>
                                <textarea
                                    value={reply}
                                    onChange={(event) =>
                                        setReply(event.target.value)
                                    }
                                    onKeyDown={(event) => {
                                        if (
                                            event.key === "Enter" &&
                                            !event.shiftKey
                                        ) {
                                            event.preventDefault();
                                            void sendReply();
                                        }
                                    }}
                                    rows={1}
                                    placeholder={`Reply to ${requesterLabel(selectedTicket)}…`}
                                    className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                                />
                                <Button
                                    size="md"
                                    className="size-11 rounded-xl"
                                    disabled={
                                        sending ||
                                        attaching ||
                                        (!reply.trim() &&
                                            pendingFiles.length === 0)
                                    }
                                    onClick={() => void sendReply()}
                                    aria-label="Send reply"
                                >
                                    {sending ? (
                                        <Loader2 className="size-4 animate-spin" />
                                    ) : (
                                        <Send className="size-4" />
                                    )}
                                </Button>
                            </div>
                            <p className="mx-auto mt-2 max-w-4xl text-xs text-muted-foreground">
                                Press Enter to send · Shift+Enter for a new line
                            </p>
                        </div>
                    </>
                ) : null}
            </section>
        </div>
    );
}
