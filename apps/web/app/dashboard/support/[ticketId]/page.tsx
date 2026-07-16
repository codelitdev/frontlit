"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Editor, TextRenderer, emptyDoc } from "@frontlit/text-editor";
import type { TextEditorContent } from "@frontlit/text-editor";
import { type Ticket, type TicketStatus, type TicketWithMessages, getTicket, replyToTicket, updateTicket } from "@/lib/api";
import { ApiError } from "@/lib/api-client";

const STATUSES: TicketStatus[] = ["open", "pending", "resolved", "closed"];

export default function TicketThreadPage({ params }: { params: Promise<{ ticketId: string }> }) {
    const { ticketId } = use(params);
    const [ticket, setTicket] = useState<TicketWithMessages | null>(null);
    const [reply, setReply] = useState<TextEditorContent>(emptyDoc as TextEditorContent);
    const [resetKey, setResetKey] = useState(0);
    const [sending, setSending] = useState(false);
    const [updatingStatus, setUpdatingStatus] = useState(false);

    useEffect(() => {
        getTicket(ticketId).then(setTicket);
    }, [ticketId]);

    async function handleReply() {
        setSending(true);
        try {
            const updated = await replyToTicket(ticketId, reply);
            setTicket(updated);
            setReply(emptyDoc as TextEditorContent);
            setResetKey((k) => k + 1);
        } catch (err) {
            alert(err instanceof ApiError ? err.message : "Failed to send reply.");
        } finally {
            setSending(false);
        }
    }

    async function handleStatusChange(status: TicketStatus) {
        if (!ticket) return;
        setUpdatingStatus(true);
        try {
            const updated: Ticket = await updateTicket(ticketId, { status });
            setTicket({ ...ticket, ...updated });
        } finally {
            setUpdatingStatus(false);
        }
    }

    if (!ticket) return <div className="p-6 text-sm text-neutral-500">Loading…</div>;

    return (
        <div className="mx-auto max-w-3xl p-6">
            <Link href="/dashboard/support" className="text-sm text-neutral-500 hover:underline">
                ← Back to inbox
            </Link>
            <div className="mt-3 flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-xl font-semibold">{ticket.subject}</h1>
                    <p className="text-sm text-neutral-500">
                        {ticket.requesterName ? `${ticket.requesterName} · ` : ""}
                        {ticket.requesterEmail} · via {ticket.source}
                    </p>
                </div>
                <select
                    value={ticket.status}
                    disabled={updatingStatus}
                    onChange={(e) => handleStatusChange(e.target.value as TicketStatus)}
                    className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
                >
                    {STATUSES.map((status) => (
                        <option key={status} value={status}>
                            {status}
                        </option>
                    ))}
                </select>
            </div>

            <div className="mt-6 space-y-4">
                {ticket.messages.map((message) => (
                    <div
                        key={message.messageId}
                        className={`rounded-md border p-3 ${
                            message.author === "requester" ? "border-neutral-200 bg-neutral-50" : "border-blue-200 bg-blue-50"
                        }`}
                    >
                        <p className="mb-1 text-xs font-medium text-neutral-500">
                            {message.author === "requester" ? "Requester" : message.author === "bot" ? "Bot" : "Agent"}
                            {message.createdAt ? ` · ${new Date(message.createdAt).toLocaleString()}` : ""}
                        </p>
                        <TextRenderer json={message.content} />
                    </div>
                ))}
            </div>

            <div className="mt-6 border-t border-neutral-200 pt-4">
                <p className="mb-2 text-sm font-medium">Reply</p>
                <Editor key={resetKey} onChange={setReply} placeholder="Write a reply…" />
                <button
                    onClick={handleReply}
                    disabled={sending}
                    className="mt-3 rounded-md bg-neutral-900 px-4 py-1.5 text-sm text-white disabled:opacity-50"
                >
                    {sending ? "Sending…" : "Send reply"}
                </button>
            </div>
        </div>
    );
}
