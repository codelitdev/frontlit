import { describe, expect, it } from "vitest";
import { LayoutTemplate } from "lucide-react";
import { blockRegistry } from "../registry";
import { resolveIcon } from "./block-picker";

describe("block icons", () => {
  const blocks = Object.values(blockRegistry);

  it("gives every block a lucide icon of its own", () => {
    for (const block of blocks) {
      expect(resolveIcon(block.metadata.icon), block.metadata.name).not.toBe(
        LayoutTemplate,
      );
    }
    const icons = blocks.map((block) => block.metadata.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });
});
