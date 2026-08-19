"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import {
    attachCustomDomain,
    getDomainSettings,
    removeCustomDomain,
    setSubdomainPublic,
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
import { IconButton } from "@/components/ui/codelit/icon-button";
import { Input } from "@/components/ui/codelit/input";
import { Label } from "@/components/ui/codelit/label";
import { Switch } from "@/components/ui/codelit/switch";
import { Badge, type badgeVariants } from "@/components/ui/codelit/badge";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/ui/codelit/card";
import type { VariantProps } from "class-variance-authority";
import { useSetBreadcrumb } from "@/components/workspace/breadcrumb-context";

const STATUS_VARIANT: Record<
    string,
    NonNullable<VariantProps<typeof badgeVariants>["variant"]>
> = {
    pending: "warning",
    verified: "success",
    failed: "destructive",
};

function platformSuffix(settings: DomainSettings): string {
    if (settings.subdomain?.hostname)
        return settings.subdomain.hostname.split(".").slice(1).join(".");
    return settings.platformDomain;
}

function recordState(value: boolean | null): string {
    if (value === null) return "not checked";
    return value ? "satisfied" : "unsatisfied";
}

function CopyValueButton({ value }: { value: string }) {
    const [copied, setCopied] = useState(false);

    async function copy() {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        } catch {
            // Clipboard can be unavailable over insecure origins.
        }
    }

    return (
        <IconButton
            type="button"
            size="sm"
            aria-label={copied ? "Copied" : "Copy value"}
            onClick={() => void copy()}
        >
            {copied ? <Check /> : <Copy />}
        </IconButton>
    );
}

export default function DomainPage() {
    useSetBreadcrumb([
        { label: "Website", href: "/website?tab=pages" },
        { label: "Domain" },
    ]);
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
            setError(
                err instanceof Error ? err.message : "Something went wrong",
            );
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
            <div className="max-w-3xl space-y-8">
                <PageHeader
                    title="Domain"
                    description="Claim a FrontLit subdomain to publish this site, then optionally attach a verified custom domain. The custom host becomes canonical; the subdomain can stay as a fallback or be turned off."
                />

                {!settings.subdomain && (
                    <Banner variant="warning">
                        Your website is not live yet. Claim a unique subdomain
                        below to publish it.
                    </Banner>
                )}

                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm">
                            Default subdomain
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <form
                            className="flex items-center gap-2"
                            onSubmit={(e) => {
                                e.preventDefault();
                                if (slug.trim())
                                    run(() => setTeamSubdomain(slug.trim()));
                            }}
                        >
                            <Input
                                value={slug}
                                onChange={(e) => setSlug(e.target.value)}
                                className="flex-1"
                            />
                            <span className="text-sm text-muted-foreground">
                                .{platformSuffix(settings)}
                            </span>
                            <Button
                                type="submit"
                                variant="outline"
                                disabled={busy}
                            >
                                Save
                            </Button>
                        </form>
                        <p className="text-xs text-muted-foreground">
                            {settings.subdomain
                                ? settings.subdomain.hostname
                                : "Choose a subdomain to create your public address."}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm">Custom domain</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {!settings.subdomain ? (
                            <p className="text-sm text-muted-foreground">
                                Choose your FrontLit subdomain first. You can
                                attach a custom domain afterwards.
                            </p>
                        ) : settings.customDomain ? (
                            <div className="space-y-3">
                                <p className="flex items-center gap-2 text-sm">
                                    {settings.customDomain.hostname}
                                    <Badge
                                        variant={
                                            STATUS_VARIANT[
                                                settings.customDomain.status
                                            ]
                                        }
                                    >
                                        {settings.customDomain.status}
                                    </Badge>
                                </p>

                                {settings.verificationRecords && (
                                    <div className="space-y-2">
                                        <p className="text-xs font-medium">
                                            Add these DNS records, then verify:
                                        </p>
                                        <div className="overflow-x-auto rounded-md border">
                                            <table className="w-full text-xs">
                                                <thead>
                                                    <tr className="border-b bg-muted/50 text-left">
                                                        <th className="px-3 py-2 font-medium">
                                                            Type
                                                        </th>
                                                        <th className="px-3 py-2 font-medium">
                                                            Name
                                                        </th>
                                                        <th className="px-3 py-2 font-medium">
                                                            Value
                                                        </th>
                                                        <th className="px-3 py-2 font-medium">
                                                            Status
                                                        </th>
                                                        <th className="w-10 px-2 py-2">
                                                            <span className="sr-only">
                                                                Copy
                                                            </span>
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    <tr className="border-b last:border-0">
                                                        <td className="px-3 py-2 align-middle">
                                                            {settings
                                                                .verificationRecords
                                                                .kind ===
                                                            "alias"
                                                                ? "ALIAS"
                                                                : "CNAME"}
                                                        </td>
                                                        <td className="max-w-[14rem] break-all px-3 py-2 align-middle font-mono">
                                                            {
                                                                settings
                                                                    .customDomain
                                                                    .hostname
                                                            }
                                                        </td>
                                                        <td className="max-w-[16rem] break-all px-3 py-2 align-middle font-mono">
                                                            {
                                                                settings
                                                                    .verificationRecords
                                                                    .cnameTarget
                                                            }
                                                        </td>
                                                        <td className="px-3 py-2 align-middle">
                                                            <Badge
                                                                variant={
                                                                    settings
                                                                        .verificationRecords
                                                                        .routingSatisfied
                                                                        ? "success"
                                                                        : "warning"
                                                                }
                                                            >
                                                                {recordState(
                                                                    settings
                                                                        .verificationRecords
                                                                        .routingSatisfied,
                                                                )}
                                                            </Badge>
                                                        </td>
                                                        <td className="px-2 py-2 align-middle">
                                                            <CopyValueButton
                                                                value={
                                                                    settings
                                                                        .verificationRecords
                                                                        .cnameTarget
                                                                }
                                                            />
                                                        </td>
                                                    </tr>
                                                    <tr>
                                                        <td className="px-3 py-2 align-middle">
                                                            TXT
                                                        </td>
                                                        <td className="max-w-[14rem] break-all px-3 py-2 align-middle font-mono">
                                                            {
                                                                settings
                                                                    .verificationRecords
                                                                    .txtName
                                                            }
                                                        </td>
                                                        <td className="max-w-[16rem] break-all px-3 py-2 align-middle font-mono">
                                                            {
                                                                settings
                                                                    .verificationRecords
                                                                    .txtValue
                                                            }
                                                        </td>
                                                        <td className="px-3 py-2 align-middle">
                                                            <Badge
                                                                variant={
                                                                    settings
                                                                        .verificationRecords
                                                                        .txtSatisfied
                                                                        ? "success"
                                                                        : "warning"
                                                                }
                                                            >
                                                                {recordState(
                                                                    settings
                                                                        .verificationRecords
                                                                        .txtSatisfied,
                                                                )}
                                                            </Badge>
                                                        </td>
                                                        <td className="px-2 py-2 align-middle">
                                                            <CopyValueButton
                                                                value={
                                                                    settings
                                                                        .verificationRecords
                                                                        .txtValue
                                                                }
                                                            />
                                                        </td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {settings.customDomain.status ===
                                    "verified" && (
                                    <div className="space-y-3">
                                        <p className="text-xs text-muted-foreground">
                                            This custom domain is canonical. The
                                            FrontLit subdomain is an optional
                                            fallback.
                                        </p>
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <Label htmlFor="subdomain-public">
                                                    Also serve this site on{" "}
                                                    {settings.subdomain
                                                        ?.hostname ??
                                                        `{slug}.${platformSuffix(settings)}`}
                                                </Label>
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    Off makes the subdomain
                                                    unavailable. Visitors only
                                                    reach the custom domain.
                                                </p>
                                            </div>
                                            <Switch
                                                id="subdomain-public"
                                                checked={
                                                    settings.subdomainPublic
                                                }
                                                disabled={busy}
                                                onCheckedChange={(checked) =>
                                                    run(() =>
                                                        setSubdomainPublic(
                                                            checked,
                                                        ),
                                                    )
                                                }
                                            />
                                        </div>
                                    </div>
                                )}

                                <div className="flex gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        disabled={busy}
                                        onClick={() => run(verifyCustomDomain)}
                                    >
                                        Check DNS
                                    </Button>
                                    <DeleteConfirm
                                        title="Remove custom domain?"
                                        description={`Remove ${settings.customDomain.hostname} from this team? Visitors will no longer be able to reach your site at this domain.`}
                                        onConfirm={() =>
                                            run(removeCustomDomain)
                                        }
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
                                    if (newDomain.trim())
                                        run(() =>
                                            attachCustomDomain(
                                                newDomain.trim(),
                                            ),
                                        ).then(() => setNewDomain(""));
                                }}
                            >
                                <Input
                                    value={newDomain}
                                    onChange={(e) =>
                                        setNewDomain(e.target.value)
                                    }
                                    placeholder="www.example.com"
                                    className="flex-1"
                                />
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
