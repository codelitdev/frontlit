/**
 * Minimal GitHub REST client for the changelog importer (architecture.md
 * §8.1, v1). Uses `fetch` directly rather than an SDK — the only surface
 * needed is "list releases for a repo".
 */

export type GithubRelease = {
    id: number;
    tag_name: string;
    name: string | null;
    body: string | null;
    html_url: string;
    published_at: string | null;
    draft: boolean;
    prerelease: boolean;
};

export class GithubApiError extends Error {}

export async function listReleases(token: string, repo: string): Promise<GithubRelease[]> {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=50`, {
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "FrontLit",
        },
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new GithubApiError(`GitHub API error ${res.status}: ${text.slice(0, 300)}`);
    }

    return (await res.json()) as GithubRelease[];
}

/** Very small markdown -> TipTap JSON converter, good enough for release
 * notes: paragraphs and `- ` bullet lists, everything else stays as plain
 * paragraphs. Kept intentionally simple for v1 (architecture.md §8.1); a
 * full markdown parser can replace this later without touching callers. */
export function markdownToTipTap(markdown: string): { type: "doc"; content: Record<string, unknown>[] } {
    const lines = markdown.replace(/\r\n/g, "\n").split("\n");
    const content: Record<string, unknown>[] = [];
    let listItems: Record<string, unknown>[] = [];

    function flushList() {
        if (listItems.length) {
            content.push({ type: "bulletList", content: listItems });
            listItems = [];
        }
    }

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
            flushList();
            continue;
        }
        const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
        if (headingMatch) {
            flushList();
            content.push({
                type: "heading",
                attrs: { level: Math.min(headingMatch[1].length, 3) },
                content: [{ type: "text", text: headingMatch[2] }],
            });
            continue;
        }
        const bulletMatch = line.match(/^[-*]\s+(.*)$/);
        if (bulletMatch) {
            listItems.push({
                type: "listItem",
                content: [{ type: "paragraph", content: [{ type: "text", text: bulletMatch[1] }] }],
            });
            continue;
        }
        flushList();
        content.push({ type: "paragraph", content: [{ type: "text", text: line }] });
    }
    flushList();

    return { type: "doc", content: content.length ? content : [] };
}
