"use client";

import { useState } from "react";

/**
 * The visitor-side reply box on a ticket's magic-link thread page
 * (architecture.md §11.2). Posts straight to the public, token-guarded
 * reply endpoint from the browser — this page has no session, only the
 * token in the URL.
 */
export function TicketReplyForm({ apiBaseUrl, teamId, ticketId, token }: { apiBaseUrl: string; teamId: string; ticketId: string; token: string }) {
    const [message, setMessage] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);
        try {
            const res = await fetch(`${apiBaseUrl}/public/${teamId}/tickets/${ticketId}/messages`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ message, token }),
            });
            if (!res.ok) throw new Error("Failed to send your reply. Please try again.");
            setMessage("");
            // Reload to show the new message in the thread — this page has
            // no client-side thread state to patch in place.
            window.location.reload();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to send your reply.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-3">
            <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Write a reply…"
                required
                rows={4}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <button
                type="submit"
                disabled={isSubmitting || !message}
                className="self-start rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
                {isSubmitting ? "Sending…" : "Send reply"}
            </button>
        </form>
    );
}
