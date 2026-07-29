import { describe, expect, it } from "vitest";
import { extractChunks } from "./chunking";
import type { TextEditorContentRow } from "../db/schema";

function heading(text: string) {
    return { type: "heading", content: [{ type: "text", text }] };
}

function paragraph(text: string) {
    return { type: "paragraph", content: [{ type: "text", text }] };
}

describe("extractChunks", () => {
    it("returns nothing for empty content", () => {
        expect(extractChunks({ type: "doc", content: [] })).toEqual([]);
        expect(extractChunks(null)).toEqual([]);
        expect(extractChunks(undefined)).toEqual([]);
    });

    it("groups paragraphs under their preceding heading with a slugified anchor", () => {
        const content: TextEditorContentRow = {
            type: "doc",
            content: [
                heading("Getting Started"),
                paragraph("First, install the CLI."),
                paragraph("Then run init."),
            ],
        };

        const chunks = extractChunks(content);

        expect(chunks).toHaveLength(1);
        expect(chunks[0].heading).toBe("Getting Started");
        expect(chunks[0].anchor).toBe("getting-started");
        expect(chunks[0].content).toContain("First, install the CLI.");
        expect(chunks[0].content).toContain("Then run init.");
    });

    it("starts a new chunk at each heading", () => {
        const content: TextEditorContentRow = {
            type: "doc",
            content: [
                heading("Intro"),
                paragraph("Intro text."),
                heading("Advanced"),
                paragraph("Advanced text."),
            ],
        };

        const chunks = extractChunks(content);

        expect(chunks.map((c) => c.heading)).toEqual(["Intro", "Advanced"]);
    });

    it("handles content with no heading at all (one chunk, no heading)", () => {
        const content: TextEditorContentRow = {
            type: "doc",
            content: [paragraph("Just a paragraph, no heading.")],
        };
        const chunks = extractChunks(content);

        expect(chunks).toHaveLength(1);
        expect(chunks[0].heading).toBeNull();
        expect(chunks[0].anchor).toBeNull();
    });

    it("splits a very long section into multiple chunks under the same heading", () => {
        const longParagraphs = Array.from({ length: 40 }, (_, i) =>
            paragraph(
                `Paragraph ${i} with a bunch of filler words to pad out the count nicely here.`,
            ),
        );
        const content: TextEditorContentRow = {
            type: "doc",
            content: [heading("Big Section"), ...longParagraphs],
        };

        const chunks = extractChunks(content);

        expect(chunks.length).toBeGreaterThan(1);
        expect(chunks.every((c) => c.heading === "Big Section")).toBe(true);
    });

    it("ignores empty/whitespace-only nodes", () => {
        const content: TextEditorContentRow = {
            type: "doc",
            content: [
                { type: "paragraph", content: [] },
                paragraph("Real content."),
            ],
        };

        const chunks = extractChunks(content);
        expect(chunks).toHaveLength(1);
        expect(chunks[0].content).toBe("Real content.");
    });
});
