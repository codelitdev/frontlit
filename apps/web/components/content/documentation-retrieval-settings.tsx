"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/codelit/button";
import { Switch } from "@/components/ui/codelit/switch";
import { documentationPanel } from "@/components/content/documentation-panel";
import { SearchTiers } from "@/components/workspace/search-tiers";
import {
  getAiConfig,
  getDocumentationSettings,
  updateDocumentationSettings,
  type AiConfig,
} from "@/lib/api";

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
  const [saved, setSaved] = useState<boolean | null>(null);
  const [ai, setAi] = useState<AiConfig | null>(null);
  async function load() {
    setOpen(true);
    setBusy(true);
    setError(null);
    try {
      const [s, ai] = await Promise.all([
        getDocumentationSettings(),
        getAiConfig().catch(() => null),
      ]);
      setVersion(s.draftVersion);
      setEnabled(s.indexing.enabled);
      setSaved(s.indexing.enabled);
      setAi(ai);
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
        indexing: { enabled },
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
  const dirty = saved === null || saved !== enabled;
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
              Choose whether your published docs and API reference appear in site search
              and AI answers.
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
            <div className="rounded-[0.625rem] border border-border px-4 py-3.5">
              <p className="mb-2.5 text-sm font-semibold">Search quality</p>
              <SearchTiers ai={ai} showSetupLink />
            </div>
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
