"use client";

import { useEffect, useState } from "react";
import {
    getTeamSettings,
    updateTeamSettings,
    type TeamSettings,
} from "@/lib/api";
import { PageHeader } from "@/components/workspace/page-header";
import { Loading } from "@/components/workspace/loading";
import { ScrollablePage } from "@/components/workspace/scrollable-page";
import { Banner } from "@/components/workspace/banner";
import { Label } from "@/components/ui/codelit/label";
import { Textarea } from "@/components/ui/codelit/textarea";
import { Card, CardContent } from "@/components/ui/codelit/card";
import { Button } from "@/components/ui/codelit/button";
import { useSetBreadcrumb } from "@/components/workspace/breadcrumb-context";

export default function CodeInjectionPage() {
    useSetBreadcrumb([
        { label: "Website", href: "/website/pages" },
        { label: "Code injection" },
    ]);
    const [settings, setSettings] = useState<TeamSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        getTeamSettings()
            .then(setSettings)
            .finally(() => setLoading(false));
    }, []);

    async function save() {
        if (!settings) return;
        setSaving(true);
        setError(null);
        try {
            setSettings(
                await updateTeamSettings({
                    codeInjectionHead: settings.codeInjectionHead,
                    codeInjectionBody: settings.codeInjectionBody,
                } as any),
            );
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Only the team owner can edit code injection.",
            );
        } finally {
            setSaving(false);
        }
    }

    if (loading || !settings) {
        return (
            <ScrollablePage>
                <Loading />
            </ScrollablePage>
        );
    }

    return (
        <ScrollablePage>
            <div className="max-w-2xl space-y-6">
                <PageHeader
                    title="Code injection"
                    description="Add third-party scripts (analytics, chat tools, pixels) to your public site. This is arbitrary script on your own site — only the team owner can edit it, and it never runs in this workspace."
                />

                {error && <Banner>{error}</Banner>}

                <Card>
                    <CardContent className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="code-head">Head</Label>
                            <Textarea
                                id="code-head"
                                value={settings.codeInjectionHead || ""}
                                onChange={(e) =>
                                    setSettings({
                                        ...settings,
                                        codeInjectionHead: e.target.value,
                                    })
                                }
                                disabled={saving}
                                rows={6}
                                placeholder="<script>...</script>"
                                className="font-mono text-xs"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="code-body">Body</Label>
                            <Textarea
                                id="code-body"
                                value={settings.codeInjectionBody || ""}
                                onChange={(e) =>
                                    setSettings({
                                        ...settings,
                                        codeInjectionBody: e.target.value,
                                    })
                                }
                                disabled={saving}
                                rows={6}
                                placeholder="<script>...</script>"
                                className="font-mono text-xs"
                            />
                        </div>
                        <Button type="button" onClick={save} disabled={saving}>
                            {saving ? "Saving…" : "Save code injection"}
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </ScrollablePage>
    );
}
