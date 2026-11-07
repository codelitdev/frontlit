import { describe, expect, it } from "vitest";
import {
  changelogDate,
  contract,
  productUpdateMetaSchema,
  publicContentPath,
} from "@frontlit/api-contract";

describe("product update contract", () => {
  it("accepts a calendar release date", () => {
    expect(productUpdateMetaSchema.parse({ releaseDate: "2026-11-07" })).toEqual({
      releaseDate: "2026-11-07",
    });
  });

  it("has no version or labels; the title and body carry them", () => {
    expect(
      productUpdateMetaSchema.parse({ version: "v1.2.0", labels: ["added"] }),
    ).toEqual({});
  });

  it.each([[{ releaseDate: "2026-11-07T10:00:00Z" }], [{ releaseDate: "07/11/2026" }]])(
    "rejects invalid meta %j",
    (meta) => {
      expect(productUpdateMetaSchema.safeParse(meta).success).toBe(false);
    },
  );

  it("caps the public page size", () => {
    const query = contract.public.listProductUpdates.query;
    expect(query.safeParse({ itemsPerPage: "1000" }).success).toBe(true);
    expect(query.safeParse({ itemsPerPage: "1001" }).success).toBe(false);
  });

  it("links every changelog entry to its anchor, ignoring section anchors", () => {
    expect(publicContentPath("changelog", "dark-mode")).toBe("/changelog#dark-mode");
    expect(publicContentPath("changelog", "dark-mode", "fixed")).toBe(
      "/changelog#dark-mode",
    );
  });

  it("dates entries by release date, else the UTC publish date", () => {
    expect(
      changelogDate({
        meta: { releaseDate: "2026-01-02" },
        publishedAt: "2026-05-05T00:00:00Z",
      }),
    ).toBe("2026-01-02");
    expect(changelogDate({ meta: {}, publishedAt: "2026-05-05T23:30:00Z" })).toBe(
      "2026-05-05",
    );
    expect(changelogDate({ meta: {}, publishedAt: null })).toBeNull();
  });
});
