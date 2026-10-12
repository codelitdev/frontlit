import { describe, expect, it } from "vitest";
import {
  CONTACT_PAGE_SIZE,
  contactListHref,
  contactPageCount,
  contactPageRange,
  parseContactPage,
} from "./contact-page";

describe("contact list pagination", () => {
  it("parses a 1-based page query", () => {
    expect(parseContactPage(undefined)).toBe(1);
    expect(parseContactPage("2")).toBe(2);
    expect(parseContactPage(["3"])).toBe(3);
    expect(parseContactPage("0")).toBe(1);
    expect(parseContactPage("nope")).toBe(1);
  });

  it("omits page=1 from the list URL", () => {
    expect(contactListHref(1)).toBe("/contacts");
    expect(contactListHref(2)).toBe("/contacts?page=2");
  });

  it("computes page count and visible range", () => {
    expect(contactPageCount(0)).toBe(1);
    expect(contactPageCount(CONTACT_PAGE_SIZE)).toBe(1);
    expect(contactPageCount(CONTACT_PAGE_SIZE + 1)).toBe(2);
    expect(contactPageRange(1, 0)).toEqual({ from: 0, to: 0 });
    expect(contactPageRange(1, 40)).toEqual({ from: 1, to: 25 });
    expect(contactPageRange(2, 40)).toEqual({ from: 26, to: 40 });
  });
});
