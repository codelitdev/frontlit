import { describe, expect, it } from "vitest";
import {
  EMPTY_CONTACT_FILTER,
  serializeContactFilter,
  toContactFilter,
} from "./contact-filters";

describe("contact filters", () => {
  it("treats a missing or empty filter as everyone", () => {
    expect(toContactFilter(null)).toEqual(EMPTY_CONTACT_FILTER);
    expect(toContactFilter(undefined)).toEqual(EMPTY_CONTACT_FILTER);
    expect(serializeContactFilter(EMPTY_CONTACT_FILTER)).toBeUndefined();
  });

  it("serializes a SendLit audience filter for GET /contacts", () => {
    const filter = toContactFilter({
      aggregator: "and",
      filters: [{ name: "tag", condition: "is", value: "frontlit" }],
    });
    expect(JSON.parse(serializeContactFilter(filter)!)).toEqual(filter);
  });
});
