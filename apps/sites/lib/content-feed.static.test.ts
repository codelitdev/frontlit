import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");

function read(relativePath: string) {
    return readFileSync(path.join(root, relativePath), "utf8");
}

describe("FrontLit content feed data-slot integration", () => {
    it("keeps FrontLit content loading outside the generic page builder", () => {
        const chrome = read("components/site-chrome.tsx");
        const feed = read("components/content-feed.tsx");

        expect(chrome).toContain("loadDataSlots");
        expect(chrome).toContain("FRONTLIT_CONTENT_FEED_SLOT");
        expect(chrome).toContain("frontlitContentFeedLoader");
        expect(feed).toContain("DataSlotLoader");
        expect(feed).toContain(
            'FRONTLIT_CONTENT_FEED_SLOT = "frontlit.content-feed"',
        );
        expect(feed).not.toMatch(/max-w-3xl|max-w-5xl/);
        expect(read("components/themed-content-feed.tsx")).toMatch(
            /Header1|Subheader1/,
        );
    });

    it("keeps public index routes as thin page-shell entry points", () => {
        for (const slug of ["blog", "docs", "changelog"]) {
            const page = read(`app/sites/[teamId]/${slug}/page.tsx`);
            expect(page).toContain("<SiteChrome");
            expect(page).not.toMatch(
                /listArticles|listDocumentation|listProductUpdates/,
            );
        }
    });
});
