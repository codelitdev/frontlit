"use client";

import { useEffect, useEffectEvent, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/codelit/button";
import { Badge } from "@/components/ui/codelit/badge";
import { Switch } from "@/components/ui/codelit/switch";
import { documentationPanel } from "@/components/content/documentation-panel";
import {
  getAiConfig,
  getDocumentationSettings,
  updateDocumentationSettings,
} from "@/lib/api";
import { cn } from "@/lib/utils";

type Mode = "lexical" | "semantic";

const MODES: { value: Mode; label: string; description: string }[] = [
  {
    value: "lexical",
    label: "Keyword",
    description:
      "Matches the words readers type. Fast and works without an AI provider.",
  },
  {
    value: "semantic",
    label: "Smart",
    description: "Finds pages by meaning, even when readers use different words.",
  },
];

export function DocumentationRetrievalSettings({
  onChanged,
  inline = false,
  triggerLabel = "Retrieval",
}: {
  onChanged: () => Promise<void>;
  inline?: boolean;
  triggerLabel?: string;
}) {
  const {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
  } = documentationPanel(inline);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [enabled, setEnabled] = useState(true);
  const [mode, setMode] = useState<Mode>("lexical");
  const [saved, setSaved] = useState<{ enabled: boolean; mode: Mode } | null>(null);
  const [hasProvider, setHasProvider] = useState(false);
  async function load() {
    setOpen(true);
    setBusy(true);
    setError(null);
    try {
      const [s, ai] = await Promise.all([
        getDocumentationSettings(),
        getAiConfig().catch(() => null),
      ]);
      const current = s.indexing.mode ?? "lexical";
      setVersion(s.draftVersion);
      setEnabled(s.indexing.enabled);
      setMode(current);
      setSaved({ enabled: s.indexing.enabled, mode: current });
      // OpenAI and Azure reuse the chat key for embeddings; others need a separate one.
      setHasProvider(
        Boolean(
          ai?.embedding ||
            (ai?.hasApiKey && (ai.provider === "openai" || ai.provider === "azure")),
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load search settings.");
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setError(null);
    try {
      await updateDocumentationSettings({
        expectedDocsDraftVersion: version,
        indexing: { enabled, mode },
      });
      await onChanged();
      toast.success("Search settings saved");
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save search settings.");
    } finally {
      setBusy(false);
    }
  }
  const loadPanel = useEffectEvent(() => void load());
  useEffect(() => {
    if (inline) loadPanel();
  }, [inline]);
  const dirty = !saved || saved.enabled !== enabled || saved.mode !== mode;
  return (
    <>
      {!inline && (
        <Button variant="outline" size="sm" onClick={load}>
          {triggerLabel}
        </Button>
      )}
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>Search and answers</DialogTitle>
            <DialogDescription>
              Choose how readers search your published docs and how answers are found.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4 rounded-[0.625rem] border border-border px-4 py-3.5">
              <div className="text-sm">
                <p className="font-semibold">Documentation search</p>
                <p className="mt-0.5 text-muted-foreground">
                  Readers can search your docs site and get answers drawn from it.
                </p>
              </div>
              <Switch
                checked={enabled}
                disabled={busy}
                onCheckedChange={setEnabled}
                aria-label="Documentation search"
              />
            </div>
            <fieldset
              className={cn(
                "m-0 min-w-0 space-y-2.5 border-0 p-0",
                !enabled && "opacity-50",
              )}
            >
              <legend className="mb-2.5 p-0 text-sm font-semibold">Search mode</legend>
              {MODES.map((m) => {
                const needsProvider =
                  m.value === "semantic" && !hasProvider && saved?.mode !== "semantic";
                const selected = mode === m.value;
                return (
                  <button
                    key={m.value}
                    type="button"
                    aria-pressed={selected}
                    disabled={busy || !enabled || needsProvider}
                    onClick={() => setMode(m.value)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-[0.625rem] border px-4 py-3.5 text-left text-sm focus-visible:shadow-[var(--shadow-focus)] focus-visible:outline-none",
                      selected
                        ? "border-primary bg-[var(--primary-soft)]"
                        : "border-border",
                      needsProvider && "cursor-not-allowed bg-muted/50",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border",
                        selected ? "border-primary" : "border-input",
                      )}
                    >
                      {selected && <span className="size-2 rounded-full bg-primary" />}
                    </span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <b className="font-semibold">{m.label}</b>
                        {saved?.mode === m.value && (
                          <Badge variant="neutral">Current</Badge>
                        )}
                        {needsProvider && (
                          <Badge variant="neutral">Needs AI provider</Badge>
                        )}
                      </span>
                      <span className="mt-0.5 block text-muted-foreground">
                        {m.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </fieldset>
            {!hasProvider && (
              <div className="flex items-center justify-between gap-3 rounded-[0.625rem] bg-muted px-4 py-3 text-sm">
                <span>Smart search needs an AI provider.</span>
                <Link
                  href="/settings/ai"
                  className="shrink-0 font-semibold text-primary hover:underline"
                >
                  Set up in Settings › AI
                </Link>
              </div>
            )}
            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
          </div>
          <DialogFooter className="mt-0 gap-2">
            <Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy || !version || !dirty} onClick={save}>
              {busy ? "Working…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
