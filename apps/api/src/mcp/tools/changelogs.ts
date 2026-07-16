import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { successMessageSchema } from "@frontlit/api-contract";
import { deleteIntegration, getGithubIntegration, upsertGithubIntegration } from "../../integrations/queries";
import { listReleases, markdownToTipTap } from "../../integrations/github";
import { createDocumentWithContent, findChangelogByGithubReleaseId } from "../../documents/queries";
import { AUTH_ERROR, INTERNAL_ERROR, jsonResult } from "./responses";
import { getTeamId } from "./auth";

const githubIntegrationSchema = z.object({ connected: z.boolean(), repo: z.string().nullable() });

/** GitHub Releases importer (architecture.md §8.1) — the generic
 * `registerDocumentTools(server, "changelog", "changelog_entry", ...)` call
 * in server.ts covers standard CRUD/draft-publish; this file adds the
 * import-specific tools. */
export function registerChangelogTools(server: McpServer): void {
    server.registerTool(
        "connect_github_changelog",
        {
            description: "Connects a GitHub repo (via a fine-grained personal access token) for changelog import.",
            inputSchema: { token: z.string().min(1), repo: z.string().min(1).describe("owner/repo, e.g. courselit/courselit") },
            outputSchema: githubIntegrationSchema,
            annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
        },
        async (args: any, extra: any) => {
            const teamId = getTeamId(extra);
            if (!teamId) return AUTH_ERROR;
            try {
                await upsertGithubIntegration(teamId, args);
                return jsonResult({ connected: true, repo: args.repo });
            } catch {
                return INTERNAL_ERROR;
            }
        },
    );

    server.registerTool(
        "get_github_changelog_integration",
        {
            description: "Gets the current team's GitHub changelog integration status.",
            inputSchema: {},
            outputSchema: githubIntegrationSchema,
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
        },
        async (_args: any, extra: any) => {
            const teamId = getTeamId(extra);
            if (!teamId) return AUTH_ERROR;
            try {
                const integration = await getGithubIntegration(teamId);
                return jsonResult({ connected: Boolean(integration), repo: integration?.repo ?? null });
            } catch {
                return INTERNAL_ERROR;
            }
        },
    );

    server.registerTool(
        "disconnect_github_changelog",
        {
            description: "Disconnects the current team's GitHub changelog integration.",
            inputSchema: {},
            outputSchema: successMessageSchema,
            annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
        },
        async (_args: any, extra: any) => {
            const teamId = getTeamId(extra);
            if (!teamId) return AUTH_ERROR;
            try {
                await deleteIntegration(teamId, "github");
                return jsonResult({ message: "GitHub integration disconnected." });
            } catch {
                return INTERNAL_ERROR;
            }
        },
    );

    server.registerTool(
        "import_github_releases",
        {
            description:
                "Lists Releases from the connected GitHub repo and creates one draft changelog entry per release, idempotent by release id. Nothing is auto-published — review and publish each entry.",
            inputSchema: {},
            outputSchema: z.object({ imported: z.number(), skipped: z.number() }),
            annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
        },
        async (_args: any, extra: any) => {
            const teamId = getTeamId(extra);
            if (!teamId) return AUTH_ERROR;
            try {
                const integration = await getGithubIntegration(teamId);
                if (!integration) return { content: [{ type: "text" as const, text: "No GitHub integration connected for this team." }], isError: true };

                const releases = await listReleases(integration.token, integration.repo);
                let imported = 0;
                let skipped = 0;

                for (const release of releases) {
                    if (release.draft) {
                        skipped++;
                        continue;
                    }
                    const existing = await findChangelogByGithubReleaseId(teamId, release.id);
                    if (existing) {
                        skipped++;
                        continue;
                    }
                    await createDocumentWithContent("changelog", {
                        teamId,
                        title: release.name || release.tag_name,
                        content: markdownToTipTap(release.body || ""),
                        meta: {
                            version: release.tag_name,
                            labels: release.prerelease ? ["prerelease"] : [],
                            releaseDate: release.published_at ?? undefined,
                            github: { releaseId: release.id, releaseUrl: release.html_url, tagName: release.tag_name },
                        },
                    });
                    imported++;
                }

                return jsonResult({ imported, skipped });
            } catch {
                return INTERNAL_ERROR;
            }
        },
    );
}
