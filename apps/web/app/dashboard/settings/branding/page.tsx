"use client";

import { useEffect, useState } from "react";
import { useMediaLit } from "@/lib/use-medialit";
import { getTeamSettings, registerMedia, updateTeamSettings, type TeamSettings } from "@/lib/api";

export default function BrandingSettingsPage() {
    const [settings, setSettings] = useState<TeamSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        getTeamSettings()
            .then(setSettings)
            .finally(() => setLoading(false));
    }, []);

    const { isUploading, uploadFile } = useMediaLit({
        signatureEndpoint: "/api/proxy/media/presigned",
        onUploadComplete: async (media) => {
            const registered = await registerMedia({ mediaLitId: media.mediaId });
            await save({ logo: registered as any });
        },
    });

    async function save(patch: Partial<TeamSettings>) {
        setSaving(true);
        try {
            setSettings(await updateTeamSettings(patch as any));
        } finally {
            setSaving(false);
        }
    }

    if (loading || !settings) return <p className="text-neutral-500">Loading…</p>;

    const logoUrl = (settings.logo as { url?: string } | null)?.url;

    return (
        <div className="max-w-xl space-y-6">
            <h1 className="text-2xl font-semibold">Branding</h1>

            <div className="space-y-4 rounded-lg border border-neutral-200 p-4">
                <div>
                    <label className="mb-1 block text-sm font-medium">Site title</label>
                    <input
                        value={settings.title || ""}
                        onChange={(e) => setSettings({ ...settings, title: e.target.value })}
                        onBlur={(e) => save({ title: e.target.value })}
                        disabled={saving}
                        className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-500"
                    />
                </div>

                <div>
                    <label className="mb-1 block text-sm font-medium">Subtitle / default description</label>
                    <input
                        value={settings.subtitle || ""}
                        onChange={(e) => setSettings({ ...settings, subtitle: e.target.value })}
                        onBlur={(e) => save({ subtitle: e.target.value })}
                        disabled={saving}
                        className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-500"
                    />
                </div>

                <div>
                    <label className="mb-1 block text-sm font-medium">Logo</label>
                    <p className="mb-2 text-xs text-neutral-500">Default OG/Twitter image, JSON-LD logo, chat widget avatar and favicon.</p>
                    <div className="flex items-center gap-3">
                        {logoUrl && <img src={logoUrl} alt="" className="h-12 w-12 rounded object-cover" />}
                        <input
                            type="file"
                            accept="image/*"
                            disabled={isUploading}
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) uploadFile(file);
                            }}
                            className="text-sm"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
