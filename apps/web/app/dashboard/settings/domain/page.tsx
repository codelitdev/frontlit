"use client";

import { useEffect, useState } from "react";
import {
    attachCustomDomain,
    getDomainSettings,
    removeCustomDomain,
    setPrimaryDomain,
    setTeamSubdomain,
    verifyCustomDomain,
    type DomainSettings,
} from "@/lib/api";

const STATUS_CLASS: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700",
    verified: "bg-emerald-100 text-emerald-700",
    failed: "bg-red-100 text-red-700",
};

export default function DomainSettingsPage() {
    const [settings, setSettings] = useState<DomainSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [slug, setSlug] = useState("");
    const [newDomain, setNewDomain] = useState("");
    const [busy, setBusy] = useState(false);

    function refresh() {
        return getDomainSettings().then((s) => {
            setSettings(s);
            setSlug(s.subdomain.hostname.split(".")[0]);
        });
    }

    useEffect(() => {
        refresh().finally(() => setLoading(false));
    }, []);

    async function run(action: () => Promise<DomainSettings>) {
        setBusy(true);
        setError(null);
        try {
            setSettings(await action());
        } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong");
        } finally {
            setBusy(false);
        }
    }

    if (loading || !settings) return <p className="text-neutral-500">Loading…</p>;

    return (
        <div className="max-w-2xl space-y-8">
            <h1 className="text-2xl font-semibold">Domain</h1>

            <section className="space-y-3 rounded-lg border border-neutral-200 p-4">
                <h2 className="font-medium">Default subdomain</h2>
                <form
                    className="flex items-center gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (slug.trim()) run(() => setTeamSubdomain(slug.trim()));
                    }}
                >
                    <input
                        value={slug}
                        onChange={(e) => setSlug(e.target.value)}
                        className="flex-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-500"
                    />
                    <span className="text-sm text-neutral-500">.{settings.subdomain.hostname.split(".").slice(1).join(".")}</span>
                    <button type="submit" disabled={busy} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm">
                        Save
                    </button>
                </form>
                <p className="text-xs text-neutral-500">
                    {settings.subdomain.hostname}
                    {settings.subdomain.isPrimary && <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5">Primary</span>}
                </p>
            </section>

            <section className="space-y-3 rounded-lg border border-neutral-200 p-4">
                <h2 className="font-medium">Custom domain</h2>
                {settings.customDomain ? (
                    <div className="space-y-3">
                        <p className="flex items-center gap-2 text-sm">
                            {settings.customDomain.hostname}
                            <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_CLASS[settings.customDomain.status]}`}>{settings.customDomain.status}</span>
                            {settings.customDomain.isPrimary && <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs">Primary</span>}
                        </p>

                        {settings.verificationRecords && (
                            <div className="space-y-2 rounded-md bg-neutral-50 p-3 text-xs">
                                <p className="font-medium">Add these DNS records, then verify:</p>
                                <p>
                                    <code>CNAME</code> → <code>{settings.verificationRecords.cnameTarget}</code>
                                </p>
                                <p>
                                    <code>TXT {settings.verificationRecords.txtName}</code> → <code>{settings.verificationRecords.txtValue}</code>
                                </p>
                            </div>
                        )}

                        <div className="flex gap-2">
                            {settings.customDomain.status !== "verified" && (
                                <button type="button" disabled={busy} onClick={() => run(verifyCustomDomain)} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm">
                                    Check DNS
                                </button>
                            )}
                            {settings.customDomain.status === "verified" && !settings.customDomain.isPrimary && (
                                <button type="button" disabled={busy} onClick={() => run(() => setPrimaryDomain("custom"))} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm">
                                    Make primary
                                </button>
                            )}
                            {settings.customDomain.isPrimary && (
                                <button type="button" disabled={busy} onClick={() => run(() => setPrimaryDomain("subdomain"))} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm">
                                    Make subdomain primary instead
                                </button>
                            )}
                            <button type="button" disabled={busy} onClick={() => run(removeCustomDomain)} className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600">
                                Remove
                            </button>
                        </div>
                    </div>
                ) : (
                    <form
                        className="flex gap-2"
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (newDomain.trim()) run(() => attachCustomDomain(newDomain.trim())).then(() => setNewDomain(""));
                        }}
                    >
                        <input
                            value={newDomain}
                            onChange={(e) => setNewDomain(e.target.value)}
                            placeholder="www.example.com"
                            className="flex-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-500"
                        />
                        <button type="submit" disabled={busy} className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white">
                            Attach
                        </button>
                    </form>
                )}
            </section>

            {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
    );
}
