import { describe, expect, it, vi } from "vitest";
import { runPlatformConformance } from "@codelitdev/platform-conformance";

const dbMock = vi.hoisted(() => ({
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({ limit: vi.fn(async () => []) })),
    })),
  })),
  insert: vi.fn(() => ({
    values: vi.fn(() => ({ returning: vi.fn(async () => [{}]) })),
  })),
}));

vi.mock("./db/client", () => ({ db: dbMock }));
vi.mock("./account/queries", () => ({
  ensureFrontLitAccountForUser: vi.fn(),
  ensureFrontLitAccountForBetterAuthUserId: vi.fn(),
}));

import { createFrontLitConformanceAdapter } from "./conformance-adapter";

describe("FrontLit Platform Conformance", () => {
  it("satisfies platform conformance capabilities suite", async () => {
    const adapter = createFrontLitConformanceAdapter();
    try {
      const result = await runPlatformConformance(adapter, {
        mcp: true,
        billing: true,
        observability: true,
        openapi: true,
        shutdown: true,
      });
      expect(result.failures).toEqual([]);
    } finally {
      await adapter.close?.();
    }
  });
});
