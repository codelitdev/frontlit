/** Server-safe heading walk. `@frontlit/text-editor`'s `extractHeadings`
 * is compiled behind `"use client"` and cannot be called from RSC. IDs
 * match the renderer (`createId`: whitespace → `-`, lowercased). */

type ContentNode = {
    type?: string;
    text?: string;
    attrs?: { level?: number };
    content?: ContentNode[];
};

export type DocHeading = {
    level: number;
    text: string;
    id: string;
};

function headingId(text: string) {
    return text.replace(/\s/g, "-").toLowerCase();
}

function collectText(node?: ContentNode): string {
    if (!node) return "";
    if (typeof node.text === "string") return node.text;
    if (!node.content) return "";
    return node.content.map(collectText).join("");
}

export function extractDocHeadings(
    json: ContentNode | null | undefined,
): DocHeading[] {
    const headings: DocHeading[] = [];

    const walk = (node?: ContentNode) => {
        if (!node) return;
        if (node.type === "heading") {
            const text = collectText(node);
            headings.push({
                level:
                    typeof node.attrs?.level === "number"
                        ? node.attrs.level
                        : 1,
                text,
                id: headingId(text),
            });
        }
        if (Array.isArray(node.content)) {
            for (const child of node.content) walk(child);
        }
    };

    walk(json ?? undefined);
    return headings;
}
