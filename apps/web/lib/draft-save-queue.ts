import { ApiError } from "./api-client";

export type DraftPatch = Record<string, unknown>;

/** A save refused because the draft changed after the editor loaded it. */
export function isStaleDraftError(error: unknown) {
  return (
    error instanceof ApiError &&
    (error.code === "STALE_DRAFT" || error.code === "STALE_DOCS_DRAFT")
  );
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Later fields win; partial `meta` patches combine. */
function mergePatch<P extends DraftPatch>(pending: P, next: P): P {
  const merged: DraftPatch = { ...pending, ...next };
  if (isPlainObject(pending.meta) && isPlainObject(next.meta))
    merged.meta = { ...pending.meta, ...next.meta };
  return merged as P;
}

export interface DraftSaveState {
  saving: boolean;
  error: string | null;
  conflict: boolean;
}

export interface DraftSaveQueueOptions<D, P> {
  save: (patch: P, expectedDraftVersion: number) => Promise<D>;
  onSaved: (draft: D) => void;
  onState: (state: DraftSaveState) => void;
}

/**
 * The saving half of draft autosave, without React. Edits are merged into one
 * pending patch and saved one request at a time, each sending the
 * `draftVersion` returned by the previous save, so an editor never conflicts
 * with itself. A save refused as stale pauses the queue and keeps the unsaved
 * edits until `adopt` (drop them) or `resume` (save them over the newer draft).
 */
export class DraftSaveQueue<D extends { draftVersion: number }, P extends DraftPatch> {
  private version: number | null = null;
  private pending = {} as P;
  private drain: Promise<boolean> | null = null;
  private paused = false;
  private lastSaved: D | null = null;
  /** Bumped by `adopt`, so a save still in flight can't override the new base. */
  private epoch = 0;

  constructor(private options: DraftSaveQueueOptions<D, P>) {}

  /** Swaps in the latest callbacks (a React host re-creates them each render). */
  configure(options: Pick<DraftSaveQueueOptions<D, P>, "save" | "onSaved">) {
    this.options = { ...this.options, ...options };
  }

  /** The version the next save is based on. */
  get draftVersion() {
    return this.version;
  }

  /** Makes `draft` the base for future saves and drops unsaved edits. */
  adopt(draft: D) {
    this.epoch += 1;
    this.version = draft.draftVersion;
    this.pending = {} as P;
    this.paused = false;
    this.options.onState({ saving: Boolean(this.drain), error: null, conflict: false });
  }

  /** Nothing unsaved, in flight or in conflict. */
  isIdle() {
    return (
      this.version !== null &&
      !this.paused &&
      !this.drain &&
      !Object.keys(this.pending).length
    );
  }

  /** Queues `patch`. Resolves true once everything queued is saved, false if a
   * save failed or the queue is paused by a conflict. `save({})` retries. */
  save(patch: P): Promise<boolean> {
    this.pending = mergePatch(this.pending, patch);
    if (this.paused || this.version === null) return Promise.resolve(false);
    return this.run();
  }

  /** Saves the unsaved edits over the draft at `version`, the newer one that
   * caused the conflict. `saved` is the last saved draft (null if nothing was
   * pending). A failed save reports through `onState`, never throws. */
  async resume(version: number): Promise<{ ok: boolean; saved: D | null }> {
    this.version = version;
    this.paused = false;
    this.lastSaved = null;
    const ok = await this.run();
    return { ok, saved: this.lastSaved };
  }

  private run(): Promise<boolean> {
    if (this.drain) return this.drain;
    const drain = (async () => {
      this.options.onState({ saving: true, error: null, conflict: false });
      let state: DraftSaveState = { saving: false, error: null, conflict: false };
      let ok = true;
      try {
        while (Object.keys(this.pending).length && this.version !== null) {
          const epoch = this.epoch;
          const updates = this.pending;
          let saved: D;
          try {
            saved = await this.options.save(updates, this.version);
          } catch (error) {
            if (epoch !== this.epoch) continue; // superseded by `adopt`
            throw error;
          }
          if (epoch !== this.epoch) continue;
          this.version = saved.draftVersion;
          this.lastSaved = saved;
          // Keep fields that changed again while this save was in flight.
          const remaining: DraftPatch = { ...this.pending };
          for (const key of Object.keys(updates))
            if (remaining[key] === updates[key]) delete remaining[key];
          this.pending = remaining as P;
          this.options.onSaved(saved);
        }
      } catch (error) {
        ok = false;
        const conflict = isStaleDraftError(error);
        if (conflict) this.paused = true;
        state = {
          saving: false,
          error: error instanceof Error ? error.message : "Request failed.",
          conflict,
        };
      } finally {
        this.drain = null;
      }
      this.options.onState(state);
      return ok;
    })();
    this.drain = drain;
    return drain;
  }
}
