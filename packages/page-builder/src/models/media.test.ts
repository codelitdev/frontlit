import { describe, expect, it } from "vitest";
import { mediaFromSelection } from "./media";

describe("mediaFromSelection", () => {
  it("stores the library mediaId, never the MediaLit id", () => {
    expect(
      mediaFromSelection({
        src: "https://cdn.example/main.png",
        alt: "Cover",
        media: {
          mediaId: "med_abc",
          mediaLitId: "OLm-jdq_8Dtt",
          thumbnailUrl: "https://cdn.example/thumb.webp",
        },
      }),
    ).toEqual({
      mediaId: "med_abc",
      url: "https://cdn.example/main.png",
      thumbnailUrl: "https://cdn.example/thumb.webp",
      alt: "Cover",
    });
  });

  it("keeps only the URL for images outside the library", () => {
    expect(
      mediaFromSelection({ src: "https://images.unsplash.com/p", alt: "" }),
    ).toEqual({
      url: "https://images.unsplash.com/p",
    });
    expect(
      mediaFromSelection({ src: "https://x/y.png", media: { mediaId: "OLm-jdq" } }),
    ).toEqual({ url: "https://x/y.png" });
  });
});
