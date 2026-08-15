import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");

function read(relativePath: string) {
    return readFileSync(path.join(root, relativePath), "utf8");
}

describe("unified content product", () => {
    it("presents one Content destination in the workspace navigation", () => {
        const sidebar = read("components/workspace/app-sidebar.tsx");

        expect(sidebar).toContain(
            '{ href: "/content?type=articles", label: "Content", icon: Library }',
        );
        expect(sidebar).not.toContain('label: "Blog"');
        expect(sidebar).not.toContain('label: "Docs"');
        expect(sidebar).not.toContain('label: "Changelog"');
    });

    it("uses product-language content types and one editor route", () => {
        const nav = read("components/content/content-type-nav.tsx");
        const editor = read("app/editor/content/[type]/[documentId]/page.tsx");

        for (const type of ["articles", "documentation", "changelog"]) {
            expect(nav).toContain(`"${type}"`);
            expect(editor).toContain(`type === "${type}"`);
        }
    });

    it("keeps old workspace URLs only as redirects", () => {
        expect(read("app/(workspace)/blog/page.tsx")).toContain(
            'redirect("/content?type=articles")',
        );
        expect(read("app/(workspace)/docs/page.tsx")).toContain(
            'redirect("/content?type=documentation")',
        );
        expect(read("app/(workspace)/changelog/page.tsx")).toContain(
            'redirect("/content?type=changelog")',
        );
    });
});
