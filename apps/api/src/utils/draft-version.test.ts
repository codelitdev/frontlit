import { describe, expect, it } from "vitest";
import { retryOnStaleDraft, StaleDraftError } from "./draft-version";

describe("retryOnStaleDraft", () => {
  it("tries again after a lost race and returns the first success", async () => {
    let calls = 0;
    const result = await retryOnStaleDraft(async () => {
      calls += 1;
      if (calls < 3) throw new StaleDraftError(calls);
      return "saved";
    });
    expect(result).toBe("saved");
    expect(calls).toBe(3);
  });

  it("gives up after ten attempts and passes other errors straight through", async () => {
    let calls = 0;
    await expect(
      retryOnStaleDraft(async () => {
        calls += 1;
        throw new StaleDraftError(calls);
      }),
    ).rejects.toBeInstanceOf(StaleDraftError);
    expect(calls).toBe(10);
    await expect(
      retryOnStaleDraft(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});
