"use client";

import { useEffect, useState } from "react";
import {
    getTeamSettings,
    updateTeamSettings,
    type TeamSettings,
} from "@/lib/api";
import { ImageUploadDialog } from "@frontlit/image-uploader";
import type { FrontLitImage } from "@/lib/frontlit-image-uploader";
import { PageHeader } from "@/components/workspace/page-header";
import { Loading } from "@/components/workspace/loading";
import { ScrollablePage } from "@/components/workspace/scrollable-page";
import { Banner } from "@/components/workspace/banner";
import { Card, CardContent } from "@/components/ui/codelit/card";
import { Button } from "@/components/ui/codelit/button";
import { Input } from "@/components/ui/codelit/input";
import { Label } from "@/components/ui/codelit/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSetBreadcrumb } from "@/components/workspace/breadcrumb-context";

function toLogoRef(image: {
    src: string;
    alt?: string;
    media?: FrontLitImage;
}): Record<string, unknown> {
    if (image.media) {
        return {
            mediaId: image.media.mediaId,
            url: image.media.url,
            thumbnailUrl: image.media.thumbnailUrl ?? undefined,
            alt: image.media.alt || image.alt,
        };
    }
    return { url: image.src, alt: image.alt };
}

export default function BrandingPage() {
    useSetBreadcrumb([
        { label: "Website", href: "/website?tab=pages" },
        { label: "Branding" },
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

    function handleLogo(image: {
        src: string;
        alt?: string;
        media?: FrontLitImage;
    }) {
        setSettings((current) =>
            current
                ? {
                      ...current,
                      logo: toLogoRef(image),
                  }
                : current,
        );
    }

    async function save() {
        if (!settings) return;
        setSaving(true);
        setError(null);
        try {
            setSettings(
                await updateTeamSettings({
                    title: settings.title ?? "",
                    subtitle: settings.subtitle ?? "",
                    logo: settings.logo,
                }),
            );
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Failed to save branding.",
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

    const logoUrl = (settings.logo as { url?: string } | null)?.url;

    return (
        <ScrollablePage>
            <div className="max-w-xl space-y-6">
                <PageHeader title="Branding" />

                {error ? <Banner>{error}</Banner> : null}

                <Card>
                    <CardContent className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="site-title">Site title</Label>
                            <Input
                                id="site-title"
                                value={settings.title || ""}
                                onChange={(e) =>
                                    setSettings({
                                        ...settings,
                                        title: e.target.value,
                                    })
                                }
                                disabled={saving}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="site-subtitle">
                                Subtitle / default description
                            </Label>
                            <Input
                                id="site-subtitle"
                                value={settings.subtitle || ""}
                                onChange={(e) =>
                                    setSettings({
                                        ...settings,
                                        subtitle: e.target.value,
                                    })
                                }
                                disabled={saving}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label>Logo</Label>
                            <p className="text-xs text-muted-foreground">
                                Default OG/Twitter image, JSON-LD logo, chat
                                widget avatar and favicon.
                            </p>
                            <div className="flex items-center gap-3">
                                <Avatar className="size-12 rounded-md">
                                    <AvatarImage src={logoUrl} alt="" />
                                    <AvatarFallback className="rounded-md">
                                        {settings.title?.slice(0, 1) || "F"}
                                    </AvatarFallback>
                                </Avatar>
                                <ImageUploadDialog<FrontLitImage>
                                    onSelect={handleLogo}
                                    title="Site logo"
                                    description="Upload a new logo or pick one from the library."
                                    allowUnsplash={false}
                                >
                                    <Button type="button" variant="outline">
                                        {logoUrl ? "Change logo" : "Add logo"}
                                    </Button>
                                </ImageUploadDialog>
                            </div>
                        </div>
                        <Button type="button" onClick={save} disabled={saving}>
                            {saving ? "Saving…" : "Save branding"}
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </ScrollablePage>
    );
}
