"use client";

import { useState } from "react";
import { Button, Text2, Textarea } from "@frontlit/page-builder/primitives";
import { useSiteThemeStyle } from "@/lib/site-theme-context";

/**
 * The visitor-side reply box on a ticket's magic-link thread page
 * (architecture.md §11.2). Posts straight to the public, token-guarded
 * reply endpoint from the browser — this page has no session, only the
 * token in the URL.
 */
export function TicketReplyForm({
  apiBaseUrl,
  teamId,
  ticketId,
  token,
}: {
  apiBaseUrl: string;
  teamId: string;
  ticketId: string;
  token: string;
}) {
  const theme = useSiteThemeStyle();
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `${apiBaseUrl}/public/${teamId}/tickets/${ticketId}/messages`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message, token }),
        },
      );
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
      <Textarea
        theme={theme}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Write a reply…"
        required
        rows={4}
      />
      {error && (
        <Text2 theme={theme} className="text-destructive">
          {error}
        </Text2>
      )}
      <Button
        theme={theme}
        type="submit"
        disabled={isSubmitting || !message}
        className="self-start"
      >
        {isSubmitting ? "Sending…" : "Send reply"}
      </Button>
    </form>
  );
}
