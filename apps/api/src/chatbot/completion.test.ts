import { describe, expect, it } from "vitest";
import { getChatAnswer } from "./completion";
import type { SearchResult } from "../documentation/queries";

describe("getChatAnswer (local extractive fallback)", () => {
    it("returns an 'I don't know' answer with no sources when nothing is retrieved", async () => {
        const result = await getChatAnswer("anything", []);
        expect(result.answer.toLowerCase()).toContain("don't know");
        expect(result.sources).toEqual([]);
    });

    it("returns the top chunk's content with a citation, and de-duplicated sources", async () => {
        const chunks: SearchResult[] = [
            { documentId: "doc_1", slug: "refunds", title: "Refund Policy", heading: "30 days", anchor: "30-days", content: "You get 30 days.", similarity: 0.9 },
            { documentId: "doc_1", slug: "refunds", title: "Refund Policy", heading: "30 days", anchor: "30-days", content: "Same section again.", similarity: 0.8 },
            { documentId: "doc_2", slug: "shipping", title: "Shipping", heading: null, anchor: null, content: "Ships in 3 days.", similarity: 0.7 },
        ];

        const result = await getChatAnswer("How long for a refund?", chunks);

        expect(result.answer).toContain("You get 30 days.");
        expect(result.answer).toContain("Refund Policy");
        expect(result.sources).toHaveLength(2);
        expect(result.sources.map((s) => s.documentId)).toEqual(["doc_1", "doc_2"]);
    });
});
