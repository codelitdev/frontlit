"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { type Ticket, type TicketStatus, listTickets } from "@/lib/api";

const STATUSES: TicketStatus[] = ["open", "pending", "resolved", "closed"];

const STATUS_LABEL: Record<TicketStatus, string> = {
    open: "Open",
    pending: "Pending",
    resolved: "Resolved",
    closed: "Closed",
};

const STATUS_CLASS: Record<TicketStatus, string> = {
    open: "bg-blue-100 text-blue-700",
    pending: "bg-amber-100 text-amber-700",
    resolved: "bg-emerald-100 text-emerald-700",
    closed: "bg-neutral-200 text-neutral-700",
};

/** Support ticket inbox (architecture.md §11.3) — status columns, one
 * fetch per column so a slow column doesn't block the others. */
export default function SupportInboxPage() {
    const [byStatus, setByStatus] = useState<Record<TicketStatus, Ticket[]>>({ open: [], pending: [], resolved: [], closed: [] });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all(
            STATUSES.map((status) =>
                listTickets({ status }).then(({ items }) => [status, items] as const),
            ),
        )
            .then((results) => {
                setByStatus(Object.fromEntries(results) as Record<TicketStatus, Ticket[]>);
            })
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="p-6">
            <h1 className="mb-4 text-xl font-semibold">Support</h1>
            {loading ? (
                <p className="text-sm text-neutral-500">Loading…</p>
            ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                    {STATUSES.map((status) => (
                        <div key={status} className="rounded-md border border-neutral-200">
                            <div className="border-b border-neutral-200 p-2">
                                <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status]}`}>
                                    {STATUS_LABEL[status]} ({byStatus[status].length})
                                </span>
                            </div>
                            <div className="divide-y divide-neutral-100">
                                {byStatus[status].length === 0 && <p className="p-3 text-xs text-neutral-400">No tickets</p>}
                                {byStatus[status].map((ticket) => (
                                    <Link
                                        key={ticket.ticketId}
                                        href={`/dashboard/support/${ticket.ticketId}`}
                                        className="block p-3 text-sm hover:bg-neutral-50"
                                    >
                                        <p className="truncate font-medium">{ticket.subject}</p>
                                        <p className="truncate text-xs text-neutral-500">{ticket.requesterEmail}</p>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
