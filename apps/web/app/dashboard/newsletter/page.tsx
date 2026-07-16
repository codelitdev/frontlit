"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api-client";
import {
    type Broadcast,
    type Contact,
    type NewsletterSettings,
    createBroadcast,
    deleteContact,
    getNewsletterSettings,
    listBroadcasts,
    listContacts,
    sendBroadcast,
    updateNewsletterSettings,
} from "@/lib/api";

/**
 * Newsletter dashboard: a thin, team-scoped read-through/adapter over
 * SendLit (architecture.md §10.2/§10.3) — FrontLit stores no contact or
 * broadcast data of its own. This is a hand-built minimal UI rather than
 * `@sendlit/email-blocks` (that package isn't publishable/installable
 * cross-repo in this environment yet); swap in the real components once
 * SendLit publishes them.
 */
export default function NewsletterPage() {
    const [settings, setSettings] = useState<NewsletterSettings | null>(null);
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
    const [loading, setLoading] = useState(true);
    const [notConnected, setNotConnected] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [newBroadcastName, setNewBroadcastName] = useState("");

    // A 409 means "no SendLit integration for this team yet" (§10.1
    // provisioning still in flight) — anything else is a real failure and
    // must not be shown as if the team were merely unprovisioned.
    function handleLoadError(err: unknown) {
        if (err instanceof ApiError && err.status === 409) {
            setNotConnected(true);
        } else {
            setLoadError(err instanceof ApiError ? err.message : "Failed to load newsletter data.");
        }
    }

    useEffect(() => {
        getNewsletterSettings()
            .then((s) => {
                setSettings(s);
                if (!s.connected) {
                    setNotConnected(true);
                    return;
                }
                return Promise.all([
                    listContacts().then(({ items }) => setContacts(items)).catch(handleLoadError),
                    listBroadcasts().then(({ items }) => setBroadcasts(items)).catch(handleLoadError),
                ]);
            })
            .catch(handleLoadError)
            .finally(() => setLoading(false));
    }, []);

    async function handleSaveSettings(e: React.FormEvent) {
        e.preventDefault();
        if (!settings) return;
        try {
            setSettings(await updateNewsletterSettings({ fromName: settings.fromName ?? undefined, fromEmail: settings.fromEmail ?? undefined }));
        } catch (err) {
            alert(err instanceof ApiError ? err.message : "Failed to save settings.");
        }
    }

    async function handleDeleteContact(contactId: string) {
        if (!confirm("Delete this contact from SendLit?")) return;
        try {
            await deleteContact(contactId);
            setContacts((prev) => prev.filter((c) => c.contactId !== contactId));
        } catch (err) {
            alert(err instanceof ApiError ? err.message : "Failed to delete contact.");
        }
    }

    async function handleCreateBroadcast(e: React.FormEvent) {
        e.preventDefault();
        if (!newBroadcastName.trim()) return;
        try {
            const created = await createBroadcast({ name: newBroadcastName.trim() });
            setBroadcasts((prev) => [created, ...prev]);
            setNewBroadcastName("");
        } catch (err) {
            alert(err instanceof ApiError ? err.message : "Failed to create broadcast.");
        }
    }

    async function handleSend(broadcastId: string) {
        if (!confirm("Send this broadcast to its audience now?")) return;
        try {
            await sendBroadcast(broadcastId);
            const { items } = await listBroadcasts();
            setBroadcasts(items);
        } catch (err) {
            alert(err instanceof ApiError ? err.message : "Failed to send broadcast.");
        }
    }

    if (loading) return <p className="text-neutral-500">Loading…</p>;

    return (
        <div className="max-w-3xl space-y-8">
            <div>
                <h1 className="mb-1 text-2xl font-semibold">Newsletter</h1>
                <p className="mb-4 text-sm text-neutral-500">
                    Leads captured through this team&rsquo;s pages sync automatically to SendLit contacts. All contact management,
                    segmentation and sending happens there — this is a thin control panel over it.
                </p>
            </div>

            {notConnected && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    This team isn&rsquo;t connected to SendLit yet. It&rsquo;s provisioned automatically in the background — check back
                    shortly, or contact support if this persists.
                </div>
            )}

            {loadError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{loadError}</div>
            )}

            {!notConnected && (
                <>
                    <div className="rounded-lg border border-neutral-200 p-4">
                        <h2 className="mb-3 text-sm font-semibold">Sender identity</h2>
                        <form onSubmit={handleSaveSettings} className="flex flex-wrap gap-2">
                            <input
                                value={settings?.fromName ?? ""}
                                onChange={(e) => setSettings((s) => (s ? { ...s, fromName: e.target.value } : s))}
                                placeholder="From name"
                                className="flex-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-500"
                            />
                            <input
                                value={settings?.fromEmail ?? ""}
                                onChange={(e) => setSettings((s) => (s ? { ...s, fromEmail: e.target.value } : s))}
                                placeholder="From email"
                                className="flex-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-500"
                            />
                            <button type="submit" className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white">
                                Save
                            </button>
                        </form>
                    </div>

                    <div>
                        <h2 className="mb-3 text-lg font-semibold">Broadcasts</h2>
                        <form onSubmit={handleCreateBroadcast} className="mb-4 flex gap-2">
                            <input
                                value={newBroadcastName}
                                onChange={(e) => setNewBroadcastName(e.target.value)}
                                placeholder="Broadcast name"
                                className="flex-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-500"
                            />
                            <button type="submit" className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white">
                                Create draft
                            </button>
                        </form>
                        <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
                            {broadcasts.length === 0 && <p className="p-4 text-sm text-neutral-500">No broadcasts yet.</p>}
                            {broadcasts.map((b) => (
                                <div key={b.broadcastId} className="flex items-center justify-between p-3">
                                    <div>
                                        <p className="font-medium">{b.name}</p>
                                        <p className="text-xs text-neutral-400">{b.status}</p>
                                    </div>
                                    <button onClick={() => handleSend(b.broadcastId)} className="rounded-md border border-neutral-200 px-3 py-1 text-xs">
                                        Send
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div>
                        <h2 className="mb-3 text-lg font-semibold">Audience</h2>
                        <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
                            {contacts.length === 0 && <p className="p-4 text-sm text-neutral-500">No contacts yet.</p>}
                            {contacts.map((c) => (
                                <div key={c.contactId} className="flex items-center justify-between p-3">
                                    <div>
                                        <p className="font-medium">{c.email}</p>
                                        <p className="text-xs text-neutral-400">{c.tags.join(", ") || "no tags"}</p>
                                    </div>
                                    <button onClick={() => handleDeleteContact(c.contactId)} className="text-xs text-red-600 hover:underline">
                                        Delete
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
