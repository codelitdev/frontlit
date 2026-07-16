"use client";

import { useEffect, useState } from "react";
import { getTeamSettings, updateTeamSettings, type TeamSettings } from "@/lib/api";

export default function CodeInjectionSettingsPage() {
    const [settings, setSettings] = useState<TeamSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        getTeamSettings()
            .then(setSettings)
            .finally(() => setLoading(false));
    }, []);

    async function save(patch: Partial<TeamSettings>) {
        setSaving(true);
        setError(null);
        try {
            setSettings(await updateTeamSettings(patch as any));
        } catch (err) {
            setError(err instanceof Error ? err.message : "Only the team owner can edit code injection.");
        } finally {
            setSaving(false);
        }
    }

    if (loading || !settings) return <p className="text-neutral-500">Loading…</p>;

    return (
        <div className="max-w-2xl space-y-6">
            <div>
                <h1 className="text-2xl font-semibold">Code injection</h1>
                <p className="mt-1 text-sm text-neutral-500">
                    Add third-party scripts (analytics, chat tools, pixels) to your public site. This is arbitrary script on your own site — only the team
                    owner can edit it, and it never runs in this dashboard.
                </p>
            </div>

            {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}

            <div>
                <label className="mb-1 block text-sm font-medium">Head</label>
                <textarea
                    value={settings.codeInjectionHead || ""}
                    onChange={(e) => setSettings({ ...settings, codeInjectionHead: e.target.value })}
                    onBlur={(e) => save({ codeInjectionHead: e.target.value })}
                    disabled={saving}
                    rows={6}
                    placeholder="<script>...</script>"
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 font-mono text-xs outline-none focus:border-neutral-500"
                />
            </div>

            <div>
                <label className="mb-1 block text-sm font-medium">Body</label>
                <textarea
                    value={settings.codeInjectionBody || ""}
                    onChange={(e) => setSettings({ ...settings, codeInjectionBody: e.target.value })}
                    onBlur={(e) => save({ codeInjectionBody: e.target.value })}
                    disabled={saving}
                    rows={6}
                    placeholder="<script>...</script>"
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 font-mono text-xs outline-none focus:border-neutral-500"
                />
            </div>
        </div>
    );
}
