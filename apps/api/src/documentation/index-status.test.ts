import { describe, expect, it } from "vitest";
import { indexForPublishedDoc, isDocIndexable } from "./index-status";

describe("document index status", () => {
  it("treats missing indexable as included", () => {
    expect(isDocIndexable(undefined)).toBe(true);
    expect(isDocIndexable({})).toBe(true);
    expect(isDocIndexable({ indexable: false })).toBe(false);
  });

  it("is null until the doc is published", () => {
    expect(indexForPublishedDoc(false, true, null, false)).toBeNull();
  });

  it("marks excluded published docs even if chunks remain", () => {
    expect(indexForPublishedDoc(true, false, null, true)).toEqual({
      state: "excluded",
      lastError: null,
    });
  });

  it("is pending while the team has a reindex request or no chunks yet", () => {
    expect(indexForPublishedDoc(true, true, { lastError: null }, true)).toEqual({
      state: "pending",
      lastError: null,
    });
    expect(indexForPublishedDoc(true, true, null, false)).toEqual({
      state: "pending",
      lastError: null,
    });
  });

  it("is indexed once its chunks exist and nothing is pending", () => {
    expect(indexForPublishedDoc(true, true, null, true)).toEqual({
      state: "indexed",
      lastError: null,
    });
  });

  it("surfaces a failed reindex", () => {
    expect(
      indexForPublishedDoc(true, true, { lastError: "provider down" }, true),
    ).toEqual({
      state: "failed",
      lastError: "provider down",
    });
  });
});
