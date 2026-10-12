"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import {
  deleteEspConfig,
  getEspConfig,
  getEmailSettings,
  retryEmailProvision,
  testEspConfig,
  updateEspConfig,
  updateEmailSettings,
  type EspConfig,
  type EspProvider,
  type EmailSettings,
} from "@/lib/api";
import { PageHeader } from "@/components/workspace/page-header";
import { Loading } from "@/components/workspace/loading";
import { ScrollablePage } from "@/components/workspace/scrollable-page";
import { Banner } from "@/components/workspace/banner";
import { DeleteConfirm } from "@/components/workspace/delete-confirm";
import { Button } from "@/components/ui/codelit/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/codelit/card";
import { Input } from "@/components/ui/codelit/input";
import { Label } from "@/components/ui/codelit/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/codelit/select";
import { Switch } from "@/components/ui/codelit/switch";
import { Textarea } from "@/components/ui/codelit/textarea";
import { useSetBreadcrumb } from "@/components/workspace/breadcrumb-context";

const PROVIDERS: Array<{ value: EspProvider; label: string }> = [
  { value: "smtp", label: "Custom SMTP" },
  { value: "sendgrid", label: "SendGrid" },
  { value: "mailgun", label: "Mailgun" },
  { value: "postmark", label: "Postmark" },
  { value: "ses", label: "Amazon SES" },
  { value: "resend", label: "Resend" },
  { value: "custom", label: "Other" },
];

type EspForm = {
  provider: EspProvider;
  host: string;
  port: string;
  secure: boolean;
  username: string;
  password: string;
  fromName: string;
  fromEmail: string;
};

const EMPTY_FORM: EspForm = {
  provider: "smtp",
  host: "",
  port: "587",
  secure: false,
  username: "",
  password: "",
  fromName: "",
  fromEmail: "",
};

function formFromConfig(config: EspConfig): EspForm {
  return {
    provider: config.provider,
    host: config.host,
    port: String(config.port),
    secure: config.secure,
    username: config.username ?? "",
    password: "",
    fromName: config.fromName ?? "",
    fromEmail: config.fromEmail ?? "",
  };
}

export default function EspSettingsPage() {
  useSetBreadcrumb([{ label: "Settings" }, { label: "ESP" }]);
  const [settings, setSettings] = useState<EmailSettings | null>(null);
  const [esp, setEsp] = useState<EspConfig | null>(null);
  const [form, setForm] = useState<EspForm>(EMPTY_FORM);
  const [testRecipient, setTestRecipient] = useState("");
  const [testResult, setTestResult] = useState<{
    success: boolean;
    error?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [notConnected, setNotConnected] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [general, config] = await Promise.all([
          getEmailSettings(),
          getEspConfig(),
        ]);
        setSettings(general);
        setEsp(config);
        setForm(config ? formFromConfig(config) : EMPTY_FORM);
        if (!general.connected) setNotConnected(true);
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          setNotConnected(true);
        } else {
          setLoadError(
            err instanceof ApiError ? err.message : "Failed to load ESP settings.",
          );
        }
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    const port = Number(form.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      toast.error("Enter a valid SMTP port.");
      return;
    }
    setSaving(true);
    try {
      const updatedSettings = await updateEmailSettings({
        mailingAddress: settings.mailingAddress ?? "",
      });
      const updatedEsp = await updateEspConfig({
        provider: form.provider,
        host: form.host.trim(),
        port,
        secure: form.secure,
        username: form.username.trim(),
        password: form.password || undefined,
        fromName: form.fromName.trim(),
        fromEmail: form.fromEmail.trim(),
      });
      setSettings(updatedSettings);
      setEsp(updatedEsp);
      setForm(formFromConfig(updatedEsp));
      toast.success("Email delivery settings saved in SendLit.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    if (!testRecipient.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testEspConfig(testRecipient.trim());
      setTestResult(result);
      toast.success("Test email sent.");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Test email failed.";
      setTestResult({ success: false, error: message });
      toast.error(message);
    } finally {
      setTesting(false);
    }
  }

  async function handleRetryProvision() {
    setRetrying(true);
    try {
      const result = await retryEmailProvision();
      if (result.connected) {
        setNotConnected(false);
        const [general, config] = await Promise.all([
          getEmailSettings(),
          getEspConfig(),
        ]);
        setSettings(general);
        setEsp(config);
        setForm(config ? formFromConfig(config) : EMPTY_FORM);
        toast.success("SendLit connection is ready.");
      } else {
        toast.error(
          result.error ||
            "SendLit is still not connected. Try again after checking the organization key.",
        );
      }
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Failed to retry SendLit provisioning.",
      );
    } finally {
      setRetrying(false);
    }
  }

  async function handleRemove() {
    try {
      await deleteEspConfig();
      setEsp(null);
      setForm(EMPTY_FORM);
      setTestResult(null);
      toast.success("ESP configuration removed from SendLit.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to remove ESP.");
    }
  }

  if (loading) {
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
          title="ESP"
          description="Configure the email service provider used for broadcasts and transactional mail. FrontLit sends through SendLit."
        />

        {notConnected && (
          <Banner variant="warning">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p>
                It&rsquo;s provisioned automatically in the background — check back
                shortly, or retry now if this persists.
              </p>
              <Button
                type="button"
                variant="outline"
                disabled={retrying}
                onClick={() => void handleRetryProvision()}
              >
                {retrying ? "Retrying…" : "Retry now"}
              </Button>
            </div>
          </Banner>
        )}

        {loadError && <Banner>{loadError}</Banner>}

        {!notConnected && settings && (
          <form onSubmit={handleSaveSettings} className="space-y-6">
            {!esp && (
              <Banner variant="warning">
                No email service provider is configured. Broadcast sends remain disabled
                until these settings are saved.
              </Banner>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Delivery provider</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="provider">Provider</Label>
                    <Select
                      value={form.provider}
                      onValueChange={(provider) =>
                        setForm((current) => ({
                          ...current,
                          provider: provider as EspProvider,
                        }))
                      }
                    >
                      <SelectTrigger id="provider" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PROVIDERS.map((provider) => (
                          <SelectItem key={provider.value} value={provider.value}>
                            {provider.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end gap-3 pb-2">
                    <Switch
                      id="secure"
                      checked={form.secure}
                      onCheckedChange={(secure) =>
                        setForm((current) => ({
                          ...current,
                          secure,
                        }))
                      }
                    />
                    <Label htmlFor="secure">Implicit TLS (usually port 465)</Label>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
                  <div className="space-y-1.5">
                    <Label htmlFor="host">SMTP host</Label>
                    <Input
                      id="host"
                      value={form.host}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          host: e.target.value,
                        }))
                      }
                      placeholder="smtp.example.com"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="port">Port</Label>
                    <Input
                      id="port"
                      type="number"
                      min={1}
                      max={65535}
                      value={form.port}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          port: e.target.value,
                        }))
                      }
                      required
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      value={form.username}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          username: e.target.value,
                        }))
                      }
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password">Password / API key</Label>
                    <Input
                      id="password"
                      type="password"
                      value={form.password}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          password: e.target.value,
                        }))
                      }
                      placeholder={
                        esp?.hasPassword ? "Saved — leave blank to retain" : ""
                      }
                      autoComplete="new-password"
                    />
                  </div>
                </div>
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Save ESP settings"}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Sender and compliance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="fromName">From name</Label>
                    <Input
                      id="fromName"
                      value={form.fromName}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          fromName: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="fromEmail">From email</Label>
                    <Input
                      id="fromEmail"
                      type="email"
                      value={form.fromEmail}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          fromEmail: e.target.value,
                        }))
                      }
                      required
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mailingAddress">Physical mailing address</Label>
                  <Textarea
                    id="mailingAddress"
                    value={settings.mailingAddress ?? ""}
                    onChange={(e) =>
                      setSettings((current) =>
                        current
                          ? {
                              ...current,
                              mailingAddress: e.target.value,
                            }
                          : current,
                      )
                    }
                    placeholder="123 Main St, City, State, Postal code, Country"
                    rows={3}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    SendLit includes this address in managed email footers and requires
                    it before sending.
                  </p>
                </div>
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Save ESP settings"}
                </Button>
              </CardContent>
            </Card>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : esp ? "Save changes" : "Configure ESP"}
              </Button>
              {esp && (
                <DeleteConfirm
                  title="Remove ESP configuration?"
                  description="SendLit will stop sending broadcasts and transactional email for this team until another ESP is configured."
                  onConfirm={handleRemove}
                  trigger={
                    <Button type="button" variant="outline">
                      Remove
                    </Button>
                  }
                />
              )}
            </div>

            {esp && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Test delivery</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      value={testRecipient}
                      onChange={(e) => setTestRecipient(e.target.value)}
                      placeholder="recipient@example.com"
                      aria-label="Test email recipient"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={testing || !testRecipient.trim()}
                      onClick={handleTest}
                    >
                      {testing ? "Sending…" : "Send test"}
                    </Button>
                  </div>
                  {testResult && (
                    <Banner variant={testResult.success ? "success" : "error"}>
                      {testResult.success
                        ? "SendLit accepted the test email."
                        : (testResult.error ?? "Test delivery failed.")}
                    </Banner>
                  )}
                </CardContent>
              </Card>
            )}
          </form>
        )}
      </div>
    </ScrollablePage>
  );
}
