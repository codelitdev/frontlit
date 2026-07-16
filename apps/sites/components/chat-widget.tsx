"use client";

import { useState } from "react";

/**
 * Floating chat button + iframe, auto-mounted on every FrontLit-hosted page
 * when the team's chatbot is enabled (architecture.md §7.3). The iframe
 * hosts `/embed/chat` on the same host, so it's implicitly scoped to this
 * team — no `data-team` attribute needed, matching the external-site embed
 * loader (`/embed/chat.js`).
 */
export function ChatWidget({ name, accentColor }: { name: string; accentColor: string | null }) {
    const [open, setOpen] = useState(false);
    const color = accentColor || "#111827";

    return (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3">
            {open && (
                <div className="h-[520px] w-[360px] max-w-[90vw] overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl">
                    <iframe src="/embed/chat" title={name} className="h-full w-full border-0" />
                </div>
            )}
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-label={open ? `Close ${name}` : `Open ${name}`}
                className="flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition-transform hover:scale-105"
                style={{ backgroundColor: color }}
            >
                {open ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-6 w-6">
                        <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                    </svg>
                ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-6 w-6">
                        <path d="M4 4h16v12H7l-3 3V4z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                )}
            </button>
        </div>
    );
}
