"use client";

import { useEffect, useState } from "react";
import {
    attachCustomDomain,
    getDomainSettings,
    removeCustomDomain,
    setTeamSubdomain,
    verifyCustomDomain,
    type DomainSettings,
} from "@/lib/api";
import { PageHeader } from "@/components/workspace/page-header";
import { Loading } from "@/components/workspace/loading";
import { ScrollablePage } from "@/components/workspace/scrollable-page";
import { Banner } from "@/components/workspace/banner";
import { DeleteConfirm } from "@/components/workspace/delete-confirm";
import { Button } from "@/components/ui/codelit/button";
import { Input } from "@/components/ui/codelit/input";
import { Badge, type badgeVariants } from "@/components/ui/codelit/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/codelit/card";
import type { VariantProps } from "class-variance-authority";
import { useSetBreadcrumb } from "@/components/workspace/breadcrumb-context";

const STATUS_VARIANT: Record<string, NonNullable<VariantProps<typeof badgeVariants>["variant"]>> = {
    pending: "warning",
    verified: "success",
    failed: "destructive",
};

export default function DomainPage() {
    useSetBreadcrumb([{ label: "Website", href: "/website/pages" }, { label: "Domain" }]);
    const [settings, setSettings] = useState<DomainSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [slug, setSlug] = useState("");
    const [newDomain, setNewDomain] = useState("");
    const [busy, setBusy] = useState(false);

    function refresh() {
        return getDomainSettings().then((s) => {
            setSettings(s);
            setSlug(s.subdomain?.name ?? "");
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

    if (loading || !settings) {
        return (
            <ScrollablePage>
                <Loading />
            </ScrollablePage>
        );
    }

    return (
        <ScrollablePage>
            <div className="max-w-2xl space-y-8">
                <PageHeader title="Domain" description="Choose a FrontLit subdomain to make this website live." />

                {!settings.subdomain && (
                    <Banner variant="warning">Your website is not live yet. Claim a unique subdomain below to publish it.</Banner>
                )}

                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm">Default subdomain</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <form
                            className="flex items-center gap-2"
                            onSubmit={(e) => {
                                e.preventDefault();
                                if (slug.trim()) run(() => setTeamSubdomain(slug.trim()));
                            }}
                        >
                            <Input value={slug} onChange={(e) => setSlug(e.target.value)} className="flex-1" />
                            <span className="text-sm text-muted-foreground">.{(settings.subdomain?.hostname ?? `site.${typeof window === "undefined" ? "frontlit.app" : location.hostname.split(":")[0]}`).split(".").slice(1).join(".")}</span>
                            <Button type="submit" variant="outline" disabled={busy}>
                                Save
                            </Button>
                        </form>
                        <p className="text-xs text-muted-foreground">
                            {settings.subdomain ? settings.subdomain.hostname : "Choose a subdomain to create your public address."}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm">Custom domain</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {!settings.subdomain ? (
                            <p className="text-sm text-muted-foreground">Choose your FrontLit subdomain first. You can attach a custom domain afterwards.</p>
                        ) : settings.customDomain ? (
                            <div className="space-y-3">
                                <p className="flex items-center gap-2 text-sm">
                                    {settings.customDomain.hostname}
                                    <Badge variant={STATUS_VARIANT[settings.customDomain.status]}>{settings.customDomain.status}</Badge>
                                </p>

                                {settings.verificationRecords && (
                                    <div className="space-y-2 rounded-md bg-muted p-3 text-xs">
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
                                        <Button type="button" variant="outline" disabled={busy} onClick={() => run(verifyCustomDomain)}>
                                            Check DNS
                                        </Button>
                                    )}
                                    {settings.customDomain.status === "verified" && (
                                        <p className="text-xs text-muted-foreground">This is your site's canonical domain. Your FrontLit subdomain remains available.</p>
                                    )}
                                    <DeleteConfirm
                                        title="Remove custom domain?"
                                        description={`Remove ${settings.customDomain.hostname} from this team? Visitors will no longer be able to reach your site at this domain.`}
                                        onConfirm={() => run(removeCustomDomain)}
                                        disabled={busy}
                                        trigger={
                                            <Button
                                                type="button"
                                                variant="outline"
                                                disabled={busy}
                                                className="border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
                                            >
                                                Remove
                                            </Button>
                                        }
                                    />
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
                                <Input value={newDomain} onChange={(e) => setNewDomain(e.target.value)} placeholder="www.example.com" className="flex-1" />
                                <Button type="submit" disabled={busy}>
                                    Attach
                                </Button>
                            </form>
                        )}
                    </CardContent>
                </Card>

                {error && <Banner>{error}</Banner>}
            </div>
        </ScrollablePage>
    );
}
