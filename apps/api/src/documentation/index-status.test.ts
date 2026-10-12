import { describe, expect, it } from "vitest";
import { indexForPublishedDoc, isDocIndexable } from "./index-status";

describe("document index status", () => {
  it("treats missing indexable as included", () => {
    expect(isDocIndexable(undefined)).toBe(true);
    expect(isDocIndexable({})).toBe(true);
    expect(isDocIndexable({ indexable: false })).toBe(false);
  });

  it("is null until the doc is published", () => {
    expect(indexForPublishedDoc(false, true, undefined, 0)).toBeNull();
  });

  it("marks excluded published docs even if chunks remain", () => {
    expect(
      indexForPublishedDoc(true, false, { status: "done", lastError: null }, 3),
    ).toEqual({ state: "excluded", lastError: null });
  });

  it("is pending while a job is queued or running", () => {
    expect(
      indexForPublishedDoc(true, true, { status: "queued", lastError: null }, 0),
    ).toEqual({ state: "pending", lastError: null });
    expect(
      indexForPublishedDoc(true, true, { status: "running", lastError: null }, 2),
    ).toEqual({ state: "pending", lastError: null });
  });

  it("is indexed after a successful job or existing chunks", () => {
    expect(
      indexForPublishedDoc(true, true, { status: "done", lastError: null }, 0),
    ).toEqual({ state: "indexed", lastError: null });
    expect(indexForPublishedDoc(true, true, undefined, 4)).toEqual({
      state: "indexed",
      lastError: null,
    });
  });

  it("surfaces failed jobs", () => {
    expect(
      indexForPublishedDoc(
        true,
        true,
        { status: "failed", lastError: "provider down" },
        0,
      ),
    ).toEqual({ state: "failed", lastError: "provider down" });
  });
});
