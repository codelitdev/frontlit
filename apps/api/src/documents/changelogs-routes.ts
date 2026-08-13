import { Router } from "express";
import { createExpressEndpoints, initServer } from "@ts-rest/express";
import { contract } from "@frontlit/api-contract";
import { requireAuth } from "../auth/middleware";
import { requireTeam } from "../auth/require-team";
import { authorizeHandlers } from "../auth/authorize";
import {
    countDocuments,
    createDocument,
    createDocumentWithContent,
    deleteDocument,
    deriveDocumentStatus,
    discardDocumentDraft,
    findChangelogByGithubReleaseId,
    getDocumentByDocumentId,
    listDocuments,
    publishDocument,
    updateDocument,
} from "./queries";
import { omitInternal, serializeDates } from "../utils/public";
import {
    deleteIntegration,
    getGithubIntegration,
    upsertGithubIntegration,
} from "../integrations/queries";
import { listReleases, markdownToTipTap } from "../integrations/github";

const KIND = "changelog" as const;

function toPublicDocument<T extends Record<string, unknown>>(doc: T) {
    return serializeDates(
        omitInternal(
            { ...doc, status: deriveDocumentStatus(doc as any) },
            "teamId",
            "kind",
        ),
    );
}

/**
 * Changelog entries reuse the shared documents engine (`kind: "changelog"`)
 * exactly like blogs/docs, plus a GitHub Releases importer (architecture.md
 * §8.1). Standard CRUD/draft-publish endpoints are implemented inline here
 * (rather than via `createDocumentsRouter`) because `contract.changelogs`
 * also carries the GitHub-specific endpoints in the same router.
 */
const router = Router();
router.use("/changelogs", requireAuth, requireTeam);

const s = initServer();

// Key order here is the actual Express route-registration order (ts-rest's
// `recursivelyApplyExpressRouter` walks this `impl` object, not the
// contract) — the literal `/changelogs/github` and `/changelogs/import-github`
// routes MUST come before the generic `/changelogs/:documentId` routes
// (`get`/`update`/`publish`/`discardDraft`/`remove`), or Express's
// first-match routing would shadow them with the wildcard (same bug class
// as `/help-docs/search` vs `/help-docs/:documentId` — see §5.3).
const impl = s.router(
    contract.changelogs,
    authorizeHandlers(
        {
            connectGithub: async ({ body, req }) => {
                await upsertGithubIntegration((req as any).teamId, body);
                return {
                    status: 200,
                    body: { connected: true, repo: body.repo },
                };
            },
            getGithubIntegration: async ({ req }) => {
                const integration = await getGithubIntegration(
                    (req as any).teamId,
                );
                return {
                    status: 200,
                    body: {
                        connected: Boolean(integration),
                        repo: integration?.repo ?? null,
                    },
                };
            },
            disconnectGithub: async ({ req }) => {
                await deleteIntegration((req as any).teamId, "github");
                return { status: 204, body: undefined };
            },
            importGithubReleases: async ({ req }) => {
                const teamId = (req as any).teamId;
                const integration = await getGithubIntegration(teamId);
                if (!integration)
                    return {
                        status: 400,
                        body: {
                            error: "No GitHub integration connected for this team",
                        },
                    };

                const releases = await listReleases(
                    integration.token,
                    integration.repo,
                );
                let imported = 0;
                let skipped = 0;

                for (const release of releases) {
                    if (release.draft) {
                        skipped++;
                        continue;
                    }
                    const existing = await findChangelogByGithubReleaseId(
                        teamId,
                        release.id,
                    );
                    if (existing) {
                        skipped++;
                        continue;
                    }

                    const title = release.name || release.tag_name;
                    await createDocumentWithContent(KIND, {
                        teamId,
                        title,
                        content: markdownToTipTap(release.body || ""),
                        meta: {
                            version: release.tag_name,
                            labels: release.prerelease ? ["prerelease"] : [],
                            releaseDate: release.published_at ?? undefined,
                            github: {
                                releaseId: release.id,
                                releaseUrl: release.html_url,
                                tagName: release.tag_name,
                            },
                        },
                    });
                    imported++;
                }

                return { status: 200, body: { imported, skipped } };
            },
            create: async ({ body, req }) => {
                const doc = await createDocument(KIND, {
                    teamId: (req as any).teamId,
                    ...body,
                });
                return { status: 201, body: toPublicDocument(doc) };
            },
            list: async ({ query, req }) => {
                const teamId = (req as any).teamId;
                const [items, total] = await Promise.all([
                    listDocuments(KIND, {
                        teamId,
                        q: query.q,
                        offset: query.offset,
                        itemsPerPage: query.itemsPerPage,
                    }),
                    countDocuments(KIND, { teamId, q: query.q }),
                ]);
                return {
                    status: 200,
                    body: { items: items.map(toPublicDocument), total },
                };
            },
            get: async ({ params, req }) => {
                const doc = await getDocumentByDocumentId(
                    KIND,
                    params.documentId,
                );
                if (!doc || doc.teamId !== (req as any).teamId)
                    return { status: 404, body: { error: "Not found" } };
                return { status: 200, body: toPublicDocument(doc) };
            },
            update: async ({ params, body, req }) => {
                const doc = await updateDocument(
                    KIND,
                    (req as any).teamId,
                    params.documentId,
                    body,
                );
                if (!doc) return { status: 404, body: { error: "Not found" } };
                return { status: 200, body: toPublicDocument(doc) };
            },
            publish: async ({ params, req }) => {
                const doc = await publishDocument(
                    KIND,
                    (req as any).teamId,
                    params.documentId,
                );
                if (!doc) return { status: 404, body: { error: "Not found" } };
                return { status: 200, body: toPublicDocument(doc) };
            },
            discardDraft: async ({ params, req }) => {
                const doc = await discardDocumentDraft(
                    KIND,
                    (req as any).teamId,
                    params.documentId,
                );
                if (!doc) return { status: 404, body: { error: "Not found" } };
                return { status: 200, body: toPublicDocument(doc) };
            },
            remove: async ({ params, req }) => {
                const result = await deleteDocument(
                    KIND,
                    (req as any).teamId,
                    params.documentId,
                );
                if (!result.ok)
                    return { status: 404, body: { error: "Not found" } };
                return { status: 204, body: undefined };
            },
        },
        {
            connectGithub: "changelogs.connectGithub",
            getGithubIntegration: "changelogs.getGithubIntegration",
            disconnectGithub: "changelogs.disconnectGithub",
            importGithubReleases: "changelogs.importGithubReleases",
            create: "changelogs.create",
            list: "changelogs.list",
            get: "changelogs.get",
            update: "changelogs.update",
            publish: "changelogs.publish",
            discardDraft: "changelogs.discardDraft",
            remove: "changelogs.remove",
        },
    ),
);

createExpressEndpoints(contract.changelogs, impl, router);

export default router;
