"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  DraftSaveQueue,
  type DraftPatch,
  type DraftSaveState,
} from "@/lib/draft-save-queue";

/** Longer than any editor's typing debounce (the text editor waits 1s). */
const EDITOR_DEBOUNCE_GRACE_MS = 1500;

export interface DraftAutosaveOptions<
  D extends { draftVersion: number },
  P extends DraftPatch,
> {
  /** Saves `patch` only if the draft is still at `expectedDraftVersion`. */
  save: (patch: P, expectedDraftVersion: number) => Promise<D>;
  /** Fetches the current draft. */
  load: () => Promise<D>;
  /** A queued save succeeded. */
  onSaved: (draft: D) => void;
  /** The editor's state is replaced by `draft` from the server (reload, keep
   * my version, discard, or a newer draft found on returning to the tab):
   * reset local fields. The editor remounts through `resetKey`. */
  onReset: (draft: D) => void;
}

/**
 * Autosave for one draft, shared by every content editor and the page
 * builder (see `DraftSaveQueue`). When someone else changed the draft (an
 * agent, Git, another tab), the save is refused, autosave pauses with the
 * unsaved edits kept, and `conflict` is set until the person reloads or keeps
 * their version. Returning to the tab with nothing unsaved quietly shows a
 * draft changed meanwhile.
 */
export function useDraftAutosave<
  D extends { draftVersion: number },
  P extends DraftPatch,
>(options: DraftAutosaveOptions<D, P>) {
  const [state, setState] = useState<DraftSaveState>({
    saving: false,
    error: null,
    conflict: false,
  });
  const [queue] = useState(
    () =>
      new DraftSaveQueue<D, P>({
        save: options.save,
        onSaved: options.onSaved,
        onState: setState,
      }),
  );
  const optionsRef = useRef(options);
  useLayoutEffect(() => {
    optionsRef.current = options;
    queue.configure({ save: options.save, onSaved: options.onSaved });
  });
  const resetKeyRef = useRef(0);
  const [resetKey, setResetKey] = useState(0);

  /** Makes `draft` the base for future saves. Call it once the draft loads. */
  const adopt = useCallback((draft: D) => queue.adopt(draft), [queue]);

  /** Adopts a draft fetched elsewhere (after publishing, say) unless there
   * are unsaved edits. Returns whether it did. */
  const adoptIfIdle = useCallback(
    (draft: D) => {
      if (!queue.isIdle()) return false;
      queue.adopt(draft);
      return true;
    },
    [queue],
  );

  /** Queues `patch`; resolves whether everything queued got saved. */
  const save = useCallback((patch: P) => queue.save(patch), [queue]);

  /** Shows `draft` in place of the editor's state: drops unsaved edits and
   * remounts the editor (pass `resetKey` as its `key`). Use it after actions
   * that replace the draft, such as discard. */
  const reset = useCallback(
    (draft: D) => {
      queue.adopt(draft);
      // Bumped before React unmounts the old editor, so the edit it flushes
      // on the way out fails `isCurrent` instead of being saved.
      resetKeyRef.current += 1;
      setResetKey(resetKeyRef.current);
      optionsRef.current.onReset(draft);
    },
    [queue],
  );

  /** Whether an editor mounted with `key` is still the current one. Check it
   * in the editor's change handler, so an editor replaced by a reset can't
   * save the edit it flushes while unmounting. */
  const isCurrent = useCallback((key: number) => key === resetKeyRef.current, []);

  /** Discards unsaved edits and loads the saved draft. */
  const reload = useCallback(async () => {
    reset(await optionsRef.current.load());
  }, [reset]);

  /** Saves the unsaved edits over the newer draft, then shows the result. */
  const keepMine = useCallback(async () => {
    const latest = await optionsRef.current.load();
    const { ok, saved } = await queue.resume(latest.draftVersion);
    if (ok) reset(saved ?? latest);
    return ok;
  }, [queue, reset]);

  // Returning to the tab: show a draft someone changed meanwhile, unless
  // there are unsaved edits (their next save reports the conflict instead).
  // Editors debounce typing (up to a second) before queuing it, so wait for
  // those edits to reach the queue before deciding it is idle.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refreshIfIdle = async () => {
      if (!queue.isIdle()) return;
      const seen = queue.draftVersion;
      let draft: D;
      try {
        draft = await optionsRef.current.load();
      } catch {
        return;
      }
      if (draft.draftVersion === seen || !queue.isIdle() || queue.draftVersion !== seen)
        return;
      reset(draft);
      toast("Updated with changes made elsewhere.");
    };
    const onVisibilityChange = () => {
      clearTimeout(timer);
      if (document.visibilityState === "visible")
        timer = setTimeout(() => void refreshIfIdle(), EDITOR_DEBOUNCE_GRACE_MS);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [queue, reset]);

  return {
    save,
    adopt,
    adoptIfIdle,
    reset,
    reload,
    keepMine,
    isCurrent,
    resetKey,
    saving: state.saving,
    saveError: state.error,
    conflict: state.conflict,
  };
}

export type DraftAutosave = ReturnType<typeof useDraftAutosave>;
