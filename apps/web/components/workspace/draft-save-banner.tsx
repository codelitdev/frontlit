"use client";

import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Banner } from "@/components/workspace/banner";
import { Button } from "@/components/ui/codelit/button";
import type { DraftAutosave } from "@/hooks/use-draft-autosave";

/** Save failures for a draft editor: the stale-draft conflict (reload or keep
 * my version) or any other failed save (retry). Renders nothing otherwise. */
export function DraftSaveBanner({
  autosave,
  className,
  children,
}: {
  autosave: Pick<
    DraftAutosave,
    "conflict" | "saveError" | "saving" | "save" | "reload" | "keepMine"
  >;
  className?: string;
  /** Extra conflict actions, such as a comparison. */
  children?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const run = (action: () => Promise<unknown>) => async () => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  if (autosave.conflict)
    return (
      <div role="alert" className={className} data-testid="draft-conflict">
        <Banner variant="warning">
          <p className="font-medium">This draft was changed elsewhere.</p>
          <p className="mt-1">
            Someone else, an agent, or another tab saved it after you opened it.
            Autosave is paused, and your unsaved edits are still here.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={run(autosave.reload)}>
              Reload saved draft
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={run(autosave.keepMine)}
            >
              Keep my version
            </Button>
            {children}
          </div>
        </Banner>
      </div>
    );

  if (autosave.saveError)
    return (
      <div role="alert" className={className}>
        <Banner>
          Your changes could not be saved. Keep this page open and retry.
          <p className="mt-1">{autosave.saveError}</p>
          <Button
            className="mt-2"
            size="sm"
            disabled={autosave.saving}
            onClick={() => void autosave.save({})}
          >
            Retry save
          </Button>
        </Banner>
      </div>
    );

  return null;
}
