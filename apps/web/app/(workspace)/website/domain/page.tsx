"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import {
  attachCustomDomain,
  getDomainSettings,
  removeCustomDomain,
  setPrimaryCustomDomain,
  setRedirectSubdomain,
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/codelit/card";
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

function RecordStateBadge({ value }: { value: boolean | null }) {
  return <Badge variant={value ? "success" : "warning"}>{recordState(value)}</Badge>;
}

function DnsRecordRow({
  type,
  name,
  value,
  satisfied,
}: {
  type: string;
  name: string;
  value: string;
  satisfied: boolean | null;
}) {
  return (
    <tr className="border-b last:border-0">
      <td className="px-3 py-2 align-middle">{type}</td>
      <td className="max-w-[14rem] break-all px-3 py-2 align-middle font-mono">
        {name}
      </td>
      <td className="max-w-[16rem] break-all px-3 py-2 align-middle font-mono">
        {value}
      </td>
      <td className="px-3 py-2 align-middle">
        <RecordStateBadge value={satisfied} />
      </td>
      <td className="px-2 py-2 align-middle">
        <CopyValueButton value={value} />
      </td>
    </tr>
  );
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

  const verifiedHosts = settings.customDomains.filter(
    (host) => host.status === "verified",
  );
  const pendingHosts = settings.customDomains.filter(
    (host) => host.status !== "verified",
  );

  return (
    <ScrollablePage>
      <div className="max-w-3xl space-y-8">
        <PageHeader
          title="Domain"
          description="Claim a FrontLit subdomain to publish this site, then optionally attach a custom domain. Attaching example.com or www.example.com adds both; once verified, the primary one becomes canonical and your other addresses redirect to it."
        />

        {!settings.subdomain && (
          <Banner variant="warning">
            Your website is not live yet. Claim a unique subdomain below to publish it.
          </Banner>
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
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="flex-1"
              />
              <span className="text-sm text-muted-foreground">
                .{platformSuffix(settings)}
              </span>
              <Button type="submit" variant="outline" disabled={busy}>
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
                Choose your FrontLit subdomain first. You can attach a custom domain
                afterwards.
              </p>
            ) : settings.customDomains.length > 0 ? (
              <div className="space-y-4">
                <ul className="space-y-2">
                  {settings.customDomains.map((host) => (
                    <li
                      key={host.hostname}
                      className="flex items-center justify-between gap-3"
                    >
                      <span className="flex items-center gap-2 text-sm">
                        {host.hostname}
                        <Badge variant={STATUS_VARIANT[host.status]}>
                          {host.status}
                        </Badge>
                        {host.primary && <Badge variant="neutral">primary</Badge>}
                      </span>
                      {!host.primary && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            run(() => setPrimaryCustomDomain(host.hostname))
                          }
                        >
                          Make primary
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>

                {pendingHosts.length > 0 && verifiedHosts.length > 0 && (
                  <Banner variant="warning">
                    {pendingHosts.map((host) => host.hostname).join(", ")} is not
                    verified yet. {settings.canonicalHost} keeps serving your site. Add
                    the missing DNS record below, then check DNS so visitors on both
                    addresses reach it.
                  </Banner>
                )}

                {settings.verification && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium">
                      Add these DNS records, then verify:
                    </p>
                    <div className="overflow-x-auto rounded-md border">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b bg-muted/50 text-left">
                            <th className="px-3 py-2 font-medium">Type</th>
                            <th className="px-3 py-2 font-medium">Name</th>
                            <th className="px-3 py-2 font-medium">Value</th>
                            <th className="px-3 py-2 font-medium">Status</th>
                            <th className="w-10 px-2 py-2">
                              <span className="sr-only">Copy</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {settings.customDomains.flatMap((host) =>
                            host.record.values.map((value) => (
                              <DnsRecordRow
                                key={`${host.hostname}-${value}`}
                                type={host.record.type}
                                name={host.hostname}
                                value={value}
                                satisfied={host.routingSatisfied}
                              />
                            )),
                          )}
                          <DnsRecordRow
                            type="TXT"
                            name={settings.verification.txtName}
                            value={settings.verification.txtValue}
                            satisfied={settings.verification.txtSatisfied}
                          />
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {verifiedHosts.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      {settings.canonicalHost} is canonical. Visitors on your other
                      addresses are permanently redirected to it.
                    </p>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <Label htmlFor="redirect-subdomain">
                          Redirect{" "}
                          {settings.subdomain?.hostname ??
                            `{slug}.${platformSuffix(settings)}`}{" "}
                          to {settings.canonicalHost}
                        </Label>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Off keeps the FrontLit subdomain serving your site. Search
                          engines are still pointed at {settings.canonicalHost}.
                        </p>
                      </div>
                      <Switch
                        id="redirect-subdomain"
                        checked={settings.redirectSubdomain}
                        disabled={busy}
                        onCheckedChange={(checked) =>
                          run(() => setRedirectSubdomain(checked))
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
                    description={`Remove ${settings.customDomains.map((host) => host.hostname).join(" and ")} from this team? Visitors will no longer be able to reach your site at ${settings.customDomains.length > 1 ? "these addresses" : "this domain"}.`}
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
                  if (newDomain.trim())
                    run(() => attachCustomDomain(newDomain.trim())).then(() =>
                      setNewDomain(""),
                    );
                }}
              >
                <Input
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  placeholder="example.com"
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
