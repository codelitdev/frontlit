"use client";

import { useEffect, useState } from "react";
import { getChatbotSettings, searchDocs, updateChatbotSettings, type ChatbotSettings, type DocSearchResult } from "@/lib/api";

export default function ChatbotSettingsPage() {
    const [settings, setSettings] = useState<ChatbotSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testMessage, setTestMessage] = useState("");
    const [testAnswer, setTestAnswer] = useState<{ answer: string; sources: DocSearchResult[] } | null>(null);
    const [asking, setAsking] = useState(false);

    useEffect(() => {
        getChatbotSettings()
            .then(setSettings)
            .finally(() => setLoading(false));
    }, []);

    async function save(patch: Partial<ChatbotSettings>) {
        setSaving(true);
        try {
            setSettings(await updateChatbotSettings(patch as any));
        } finally {
            setSaving(false);
        }
    }

    async function handleTest(e: React.FormEvent) {
        e.preventDefault();
        if (!testMessage.trim()) return;
        setAsking(true);
        setTestAnswer(null);
        try {
            const { items } = await searchDocs(testMessage.trim());
            // Mirrors the public chat endpoint's retrieval step so the
            // dashboard can preview grounding without needing the chatbot
            // to be enabled on the public site yet.
            setTestAnswer({ answer: items[0]?.content ?? "No matching docs found.", sources: items });
        } finally {
            setAsking(false);
        }
    }

    if (loading || !settings) return <p className="text-neutral-500">Loading…</p>;

    return (
        <div className="max-w-xl">
            <h1 className="mb-4 text-2xl font-semibold">Chatbot</h1>

            <div className="mb-6 space-y-4 rounded-lg border border-neutral-200 p-4">
                <label className="flex items-center justify-between">
                    <span className="text-sm font-medium">Enabled</span>
                    <input
                        type="checkbox"
                        checked={settings.enabled}
                        onChange={(e) => save({ enabled: e.target.checked })}
                        disabled={saving}
                        data-testid="chatbot-enabled-toggle"
                    />
                </label>

                <div>
                    <label className="mb-1 block text-sm font-medium">Assistant name</label>
                    <input
                        value={settings.name}
                        onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                        onBlur={(e) => save({ name: e.target.value })}
                        className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-500"
                    />
                </div>

                <div>
                    <label className="mb-1 block text-sm font-medium">Greeting</label>
                    <input
                        value={settings.greeting || ""}
                        onChange={(e) => setSettings({ ...settings, greeting: e.target.value })}
                        onBlur={(e) => save({ greeting: e.target.value })}
                        className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-500"
                    />
                </div>

                <label className="flex items-center justify-between">
                    <span className="text-sm font-medium">Offer "talk to a human"</span>
                    <input
                        type="checkbox"
                        checked={settings.escalationEnabled}
                        onChange={(e) => save({ escalationEnabled: e.target.checked })}
                        disabled={saving}
                        data-testid="chatbot-escalation-toggle"
                    />
                </label>
                <p className="-mt-2 text-xs text-neutral-500">
                    When the bot can't answer, it offers to raise a support ticket with the conversation attached (architecture.md §11.2).
                </p>
            </div>

            <h2 className="mb-2 text-lg font-semibold">Test grounding</h2>
            <p className="mb-3 text-xs text-neutral-500">Preview which published doc chunks would ground an answer to this question.</p>
            <form onSubmit={handleTest} className="mb-4 flex gap-2">
                <input
                    value={testMessage}
                    onChange={(e) => setTestMessage(e.target.value)}
                    placeholder="Ask a question…"
                    className="flex-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-500"
                />
                <button type="submit" className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white">
                    {asking ? "Asking…" : "Test"}
                </button>
            </form>
            {testAnswer && (
                <div className="rounded-md border border-neutral-200 p-3 text-sm">
                    <p className="mb-2">{testAnswer.answer}</p>
                    {testAnswer.sources.length > 0 && (
                        <p className="text-xs text-neutral-400">Sources: {testAnswer.sources.map((s) => s.title).join(", ")}</p>
                    )}
                    {testAnswer.sources.length === 0 && settings.escalationEnabled && (
                        <p className="mt-2 text-xs text-amber-700">
                            No grounding found — the live widget would offer "talk to a human" here (architecture.md §11.2).
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
