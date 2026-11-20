import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contentFormat, describeContentFormat } from "./format";

describe("content format reference", () => {
  it("schema/content.v1.json is up to date (bun run schema:generate)", () => {
    const committed = JSON.parse(
      readFileSync(new URL("../../schema/content.v1.json", import.meta.url), "utf8"),
    );
    // Compared as data: the formatter may lay the file out differently.
    expect(committed).toEqual(JSON.parse(JSON.stringify(contentFormat())));
  });

  it("describes every block with its props and an example", () => {
    const text = describeContentFormat();
    for (const tag of ["Callout", "Tabs", "Button", "WebPreview", "H5P"])
      expect(text).toContain(`- ${tag}:`);
    expect(text).toContain(
      '"note" | "tip" | "info" | "success" | "warning" | "danger"',
    );
    expect(text).toContain("https://frontlit.app/schema/content.v1.json");
  });
});
