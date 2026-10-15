import { describe, expect, it } from "vitest";
import { fluidFontSize } from "./heading";

describe("fluidFontSize", () => {
  it("clamps between the phone and desktop sizes", () => {
    expect(fluidFontSize({ min: 32, max: 48 })).toBe(
      "clamp(2rem, 1.6087rem + 1.7391vw, 3rem)",
    );
  });

  it("keeps the bounds ordered when min is larger than max", () => {
    expect(fluidFontSize({ min: 48, max: 32 })).toMatch(/^clamp\(2rem, .*, 3rem\)$/);
  });
});
