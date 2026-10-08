"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/codelit/button";
import { Label } from "@/components/ui/codelit/label";
import { documentationPanel } from "@/components/content/documentation-panel";
import { getDocumentationSettings, updateDocumentationSettings } from "@/lib/api";

export function DocumentationRetrievalSettings({
  onChanged,
  inline = false,
  triggerLabel = "Retrieval",
}: {
  onChanged: () => Promise<void>;
  inline?: boolean;
  triggerLabel?: string;
}) {
  const { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } =
    documentationPanel(inline);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [enabled, setEnabled] = useState(true);
  const [mode, setMode] = useState<"lexical" | "semantic">("lexical");
  const [saved, setSaved] = useState(false);
  async function load() {
    setOpen(true);
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const s = await getDocumentationSettings();
      setVersion(s.draftVersion);
      setEnabled(s.indexing.enabled);
      setMode(s.indexing.mode ?? "lexical");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load retrieval settings.");
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const s = await updateDocumentationSettings({
        expectedDocsDraftVersion: version,
        indexing: { enabled, mode },
      });
      setVersion(s.draftVersion);
      setSaved(true);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save retrieval settings.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (inline) {
      void load();
    }
  }, [inline]);
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Documentation retrieval</DialogTitle>
            <DialogDescription>
              Search uses the accepted publication and its current serving policy.
              Changing retrieval settings prepares a new generation while the current
              publication stays live.
            </DialogDescription>
          </DialogHeader>
          <Label>
            <input
              type="checkbox"
              checked={enabled}
              disabled={busy}
              onChange={(e) => setEnabled(e.target.checked)}
            />{" "}
            Enable documentation search
          </Label>
          <Label>
            Search mode
            <select
              className="ml-2 rounded border p-2"
              value={mode}
              disabled={busy}
              onChange={(e) => setMode(e.target.value as "lexical" | "semantic")}
            >
              <option value="lexical">Lexical</option>
              <option value="semantic">Semantic</option>
            </select>
          </Label>
          <p>
            {mode === "semantic"
              ? "Requires a configured embedding provider and available team AI budget. Preparation failures appear in History; the current publication remains active."
              : "Lexical search works without an AI provider."}
          </p>
          {error && <p role="alert">{error}</p>}
          {saved && (
            <p role="status">Settings saved. Check History for any new preparation.</p>
          )}
          <Button disabled={busy || !version} onClick={save}>
            {busy ? "Working…" : "Save retrieval settings"}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
