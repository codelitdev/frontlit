import { describe, expect, it } from "vitest";
import { signPreview, verifyPreview } from "./git-preview";

describe("preview tokens", () => {
  process.env.PREVIEW_SIGNING_SECRET = "test-secret";

  it("accepts its own token for its release only", () => {
    const token = signPreview("rel_a");
    expect(verifyPreview("rel_a", token)).toBe(true);
    expect(verifyPreview("rel_b", token)).toBe(false);
    expect(verifyPreview("rel_a", `${token}0`)).toBe(false);
    expect(verifyPreview("rel_a", undefined)).toBe(false);
  });

  it("expires", () => {
    const token = signPreview("rel_a", Date.now() - 31 * 24 * 60 * 60 * 1000);
    expect(verifyPreview("rel_a", token)).toBe(false);
  });
});
