"use client";

import { useState } from "react";
import {
  addRedirectDomain,
  removeRedirectDomain,
  updateRedirectDomain,
  verifyRedirectDomain,
  type DomainSettings,
  type RedirectDomain,
  type RedirectRule,
} from "@/lib/api";
import { DeleteConfirm } from "@/components/workspace/delete-confirm";
import { Button } from "@/components/ui/codelit/button";
import { Input } from "@/components/ui/codelit/input";
import { Label } from "@/components/ui/codelit/label";
import { Textarea } from "@/components/ui/codelit/textarea";
import { Badge } from "@/components/ui/codelit/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/codelit/card";
import { DnsRecordRow, DnsRecordsTable, STATUS_VARIANT } from "./dns-records";

type Run = (action: () => Promise<DomainSettings>) => Promise<void>;

/** One rule per line: `/old-path /new-path`. */
function formatRules(rules: RedirectRule[]): string {
  return rules.map((rule) => `${rule.from} ${rule.to}`).join("\n");
}

function parseRules(text: string): RedirectRule[] | string {
  const rules: RedirectRule[] = [];
  const seen = new Set<string>();
  for (const [index, line] of text.split("\n").entries()) {
    const parts = line.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) continue;
    if (parts.length !== 2 || !parts.every((part) => part.startsWith("/")))
      return `Line ${index + 1}: write the old path and the new path, e.g. /api/old /docs/api/new`;
    const from = parts[0]!.replace(/\/+$/, "") || "/";
    if (seen.has(from))
      return `Line ${index + 1}: ${parts[0]} already has a rule above.`;
    seen.add(from);
    rules.push({ from: parts[0]!, to: parts[1]! });
  }
  return rules;
}

const PREFIX = /^(\/[A-Za-z0-9._~-]+)*$/;

function RedirectDomainItem({
  host,
  canonicalHost,
  busy,
  run,
}: {
  host: RedirectDomain;
  canonicalHost: string | null;
  busy: boolean;
  run: Run;
}) {
  const [prefix, setPrefix] = useState(host.pathPrefix);
  const [rules, setRules] = useState(formatRules(host.rules));
  const [formError, setFormError] = useState<string | null>(null);
  const changed =
    prefix !== host.pathPrefix || rules.trim() !== formatRules(host.rules).trim();

  function save() {
    if (!PREFIX.test(prefix.trim())) {
      setFormError(
        'The path prefix must be empty or look like "/docs", with no trailing slash.',
      );
      return;
    }
    const parsed = parseRules(rules);
    if (typeof parsed === "string") {
      setFormError(parsed);
      return;
    }
    setFormError(null);
    void run(() =>
      updateRedirectDomain(host.hostname, { pathPrefix: prefix.trim(), rules: parsed }),
    );
  }

  return (
    <li className="space-y-4 rounded-md border p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-medium">
          {host.hostname}
          <Badge variant={STATUS_VARIANT[host.status]}>{host.status}</Badge>
        </span>
        <span className="text-xs text-muted-foreground">
          {host.hostname}/page → {canonicalHost}
          {host.pathPrefix}/page
        </span>
      </div>

      {host.status !== "verified" && (
        <div className="space-y-2">
          <p className="text-xs font-medium">Add these DNS records, then check DNS:</p>
          <DnsRecordsTable>
            {host.record.values.map((value) => (
              <DnsRecordRow
                key={value}
                type={host.record.type}
                name={host.hostname}
                value={value}
                satisfied={host.routingSatisfied}
              />
            ))}
            <DnsRecordRow
              type="TXT"
              name={host.verification.txtName}
              value={host.verification.txtValue}
              satisfied={host.verification.txtSatisfied}
            />
          </DnsRecordsTable>
        </div>
      )}

      <div className="space-y-1">
        <Label htmlFor={`prefix-${host.hostname}`}>Path prefix</Label>
        <Input
          id={`prefix-${host.hostname}`}
          value={prefix}
          onChange={(event) => setPrefix(event.target.value)}
          placeholder="/docs"
        />
        <p className="text-xs text-muted-foreground">
          Put in front of every path. Leave empty to keep paths as they are.
        </p>
      </div>

      <div className="space-y-1">
        <Label htmlFor={`rules-${host.hostname}`}>Renamed paths</Label>
        <Textarea
          id={`rules-${host.hostname}`}
          value={rules}
          onChange={(event) => setRules(event.target.value)}
          rows={Math.min(12, Math.max(3, rules.split("\n").length + 1))}
          placeholder={"/api/uploadMedia /docs/api/upload-media\n/rest-api /docs/api"}
          className="font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">
          One per line: the old path on {host.hostname}, then the new path on your site.
          These win over the prefix.
        </p>
      </div>

      {formError && <p className="text-xs text-destructive">{formError}</p>}

      <div className="flex gap-2">
        <Button type="button" disabled={busy || !changed} onClick={save}>
          Save
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => void run(() => verifyRedirectDomain(host.hostname))}
        >
          Check DNS
        </Button>
        <DeleteConfirm
          title="Remove redirect domain?"
          description={`Links to ${host.hostname} will stop redirecting to your site.`}
          onConfirm={() => run(() => removeRedirectDomain(host.hostname))}
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
    </li>
  );
}

/** Old hosts that permanently redirect to this site, e.g. a previous docs host. */
export function RedirectDomainsCard({
  settings,
  busy,
  run,
}: {
  settings: DomainSettings;
  busy: boolean;
  run: Run;
}) {
  const [hostname, setHostname] = useState("");
  const [prefix, setPrefix] = useState("");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Redirect domains</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Keep links to an old address working. A redirect domain shows nothing itself:
          every visit is permanently redirected to{" "}
          {settings.canonicalHost ?? "your site"}.
        </p>
        {!settings.subdomain ? (
          <p className="text-sm text-muted-foreground">
            Choose your FrontLit subdomain first.
          </p>
        ) : (
          <>
            {settings.redirectDomains.length > 0 && (
              <ul className="space-y-3">
                {settings.redirectDomains.map((host) => (
                  <RedirectDomainItem
                    // Reset the form fields when the saved values change.
                    key={`${host.hostname}:${host.pathPrefix}:${formatRules(host.rules)}`}
                    host={host}
                    canonicalHost={settings.canonicalHost}
                    busy={busy}
                    run={run}
                  />
                ))}
              </ul>
            )}
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!hostname.trim()) return;
                // Clear the fields only once the domain is added; `run` shows errors.
                void run(async () => {
                  const next = await addRedirectDomain(hostname.trim(), prefix.trim());
                  setHostname("");
                  setPrefix("");
                  return next;
                });
              }}
            >
              <Input
                value={hostname}
                onChange={(event) => setHostname(event.target.value)}
                placeholder="docs.example.com"
                aria-label="Redirect domain"
                className="flex-1"
              />
              <Input
                value={prefix}
                onChange={(event) => setPrefix(event.target.value)}
                placeholder="/docs (optional)"
                aria-label="Path prefix"
                className="w-40"
              />
              <Button type="submit" variant="outline" disabled={busy}>
                Add
              </Button>
            </form>
          </>
        )}
      </CardContent>
    </Card>
  );
}
