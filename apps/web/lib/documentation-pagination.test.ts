import { afterEach, describe, expect, it, vi } from "vitest";
import { listAllDocumentationPages } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("complete documentation loading", () => {
  it("uses one-based page numbers when loading more than 500 documents", async () => {
    const documents = Array.from({ length: 501 }, (_, index) => ({
      documentId: `doc_${index}`,
    }));
    const requestedPages: number[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = new URL(String(input), "http://localhost:3000");
        const page = Number(url.searchParams.get("offset"));
        requestedPages.push(page);
        expect(url.pathname).toBe("/api/proxy/content/documentation");
        expect(url.searchParams.get("itemsPerPage")).toBe("500");
        if (!Number.isInteger(page) || page < 1) {
          return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
        }
        return Response.json({
          items: documents.slice((page - 1) * 500, page * 500),
          total: documents.length,
        });
      }),
    );

    expect(await listAllDocumentationPages()).toEqual(documents);
    expect(requestedPages).toEqual([1, 2]);
  });

  it("requests page one for an empty documentation area", async () => {
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input), "http://localhost:3000");
      expect(url.searchParams.get("offset")).toBe("1");
      return Response.json({ items: [], total: 0 });
    });
    vi.stubGlobal("fetch", fetch);
    expect(await listAllDocumentationPages()).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
