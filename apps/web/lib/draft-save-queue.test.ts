import { describe, expect, it } from "vitest";
import { ApiError } from "./api-client";
import { DraftSaveQueue, type DraftSaveState } from "./draft-save-queue";

type Draft = { draftVersion: number; title?: string; meta?: Record<string, unknown> };
type Patch = { title?: string; content?: string; meta?: Record<string, unknown> };

/** A fake server holding one draft with compare-and-swap saves. */
function setup() {
  const server: Draft = { draftVersion: 1 };
  const calls: Array<{ patch: Patch; expected: number }> = [];
  let gate: Promise<void> | null = null;
  const states: DraftSaveState[] = [];
  const saved: Draft[] = [];
  const queue = new DraftSaveQueue<Draft, Patch>({
    save: async (patch, expected) => {
      calls.push({ patch, expected });
      if (gate) await gate;
      if (expected !== server.draftVersion)
        throw new ApiError(409, "This draft was changed elsewhere.", "STALE_DRAFT");
      Object.assign(server, patch, { draftVersion: server.draftVersion + 1 });
      return { ...server };
    },
    onSaved: (draft) => saved.push(draft),
    onState: (state) => states.push(state),
  });
  queue.adopt({ draftVersion: 1 });
  const hold = () => {
    let release!: () => void;
    gate = new Promise((resolve) => (release = resolve));
    return () => {
      gate = null;
      release();
    };
  };
  return { server, calls, states, saved, queue, hold, last: () => states.at(-1)! };
}

describe("DraftSaveQueue", () => {
  it("sends each save with the version returned by the previous one", async () => {
    const { queue, calls } = setup();
    expect(await queue.save({ title: "a" })).toBe(true);
    expect(await queue.save({ title: "b" })).toBe(true);
    expect(calls.map((call) => call.expected)).toEqual([1, 2]);
    expect(queue.draftVersion).toBe(3);
  });

  it("merges edits made while a save is in flight into one follow-up save", async () => {
    const { queue, calls, hold } = setup();
    const release = hold();
    const first = queue.save({ title: "a" });
    const second = queue.save({ content: "x" });
    const third = queue.save({ meta: { tags: ["t"] } });
    const fourth = queue.save({ meta: { indexable: false } });
    release();
    expect(await Promise.all([first, second, third, fourth])).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(calls).toEqual([
      { patch: { title: "a" }, expected: 1 },
      { patch: { content: "x", meta: { tags: ["t"], indexable: false } }, expected: 2 },
    ]);
  });

  it("pauses on a stale save, keeps the edits, and reports a conflict", async () => {
    const { queue, server, calls, last } = setup();
    server.draftVersion = 5; // an agent saved meanwhile
    expect(await queue.save({ title: "mine" })).toBe(false);
    expect(last()).toMatchObject({ saving: false, conflict: true });
    expect(await queue.save({ content: "more" })).toBe(false);
    expect(calls).toHaveLength(1);
    expect(queue.isIdle()).toBe(false);
  });

  it("resume saves the kept edits over the newer draft", async () => {
    const { queue, server, calls, last } = setup();
    server.draftVersion = 5;
    await queue.save({ title: "mine" });
    await queue.save({ content: "more" });
    const { ok, saved } = await queue.resume(5);
    expect(ok).toBe(true);
    expect(saved).toMatchObject({ draftVersion: 6, title: "mine", content: "more" });
    expect(calls.at(-1)).toEqual({
      patch: { title: "mine", content: "more" },
      expected: 5,
    });
    expect(last()).toMatchObject({ conflict: false, error: null });
  });

  it("adopt drops kept edits and clears the conflict", async () => {
    const { queue, server, calls, last } = setup();
    server.draftVersion = 5;
    await queue.save({ title: "mine" });
    queue.adopt({ draftVersion: 5 });
    expect(last()).toMatchObject({ conflict: false });
    expect(queue.isIdle()).toBe(true);
    expect(await queue.save({ content: "after reload" })).toBe(true);
    expect(calls.at(-1)).toEqual({ patch: { content: "after reload" }, expected: 5 });
  });

  it("ignores the result of a save that was in flight when a new draft was adopted", async () => {
    const { queue, server, hold } = setup();
    const release = hold();
    const inFlight = queue.save({ title: "before discard" });
    server.draftVersion = 9; // discarded meanwhile
    queue.adopt({ draftVersion: 9 });
    release();
    await inFlight;
    expect(queue.draftVersion).toBe(9);
  });

  it("reports other failures without pausing", async () => {
    const queue = new DraftSaveQueue<Draft, Patch>({
      save: async () => {
        throw new ApiError(500, "Server unavailable", "request_failed");
      },
      onSaved: () => {},
      onState: () => {},
    });
    queue.adopt({ draftVersion: 1 });
    expect(await queue.save({ title: "a" })).toBe(false);
    expect(queue.isIdle()).toBe(false); // the edit is still pending for a retry
  });
});
