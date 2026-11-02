"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import {
  attachCustomDomain,
  getDomainSettings,
  removeCustomDomain,
  setHideFromSearch,
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
import { Input } from "@/components/ui/codelit/input";
import { Label } from "@/components/ui/codelit/label";
import { Switch } from "@/components/ui/codelit/switch";
import { Badge } from "@/components/ui/codelit/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/codelit/card";
import { useSetBreadcrumb } from "@/components/workspace/breadcrumb-context";
import { siteUrl } from "@/lib/site-url";
import { DnsRecordRow, DnsRecordsTable, STATUS_VARIANT } from "./dns-records";
import { RedirectDomainsCard } from "./redirect-domains";

function platformSuffix(settings: DomainSettings): string {
  if (settings.subdomain?.hostname)
    return settings.subdomain.hostname.split(".").slice(1).join(".");
  return settings.platformDomain;
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

        {settings.subdomain && settings.hideFromSearch && (
          <Banner variant="warning">
            Your site is hidden from search engines. Every page is marked noindex and
            crawlers are blocked. It turns off automatically when a custom domain is
            verified, or you can turn it off under Search engines below.
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
            {settings.subdomain ? (
              <a
                href={siteUrl(settings.subdomain.hostname)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {settings.subdomain.hostname}
                <ExternalLink className="size-3" aria-hidden="true" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            ) : (
              <p className="text-xs text-muted-foreground">
                Choose a subdomain to create your public address.
              </p>
            )}
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
                    <DnsRecordsTable>
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
                    </DnsRecordsTable>
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

        <RedirectDomainsCard settings={settings} busy={busy} run={run} />

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Search engines</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label htmlFor="hide-from-search">Hide from search engines</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Keeps a site that hasn&apos;t launched out of search results: every
                  page is marked noindex, robots.txt blocks all crawlers and the sitemap
                  is empty.
                </p>
              </div>
              <Switch
                id="hide-from-search"
                checked={settings.hideFromSearch}
                disabled={busy}
                onCheckedChange={(checked) => run(() => setHideFromSearch(checked))}
              />
            </div>
          </CardContent>
        </Card>

        {error && <Banner>{error}</Banner>}
      </div>
    </ScrollablePage>
  );
}
