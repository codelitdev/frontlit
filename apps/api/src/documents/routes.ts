import { Router } from "express";
import { createExpressEndpoints, initServer } from "@ts-rest/express";
import { requireAuth } from "../auth/middleware";
import { requireTeam } from "../auth/require-team";
import { authorizeHandlers } from "../auth/authorize";
import type { RestOperation } from "../auth/operation-policy";
import type { DocumentKind } from "../db/schema";
import {
    countDocuments,
    createDocument,
    deleteDocument,
    deriveDocumentStatus,
    discardDocumentDraft,
    getDocumentByDocumentId,
    listDocuments,
    publishDocument,
    updateDocument,
} from "./queries";
import { omitInternal, serializeDates } from "../utils/public";
import { findTeamById } from "../team/queries";
import { revalidateTeam } from "../services/revalidate";
import { InvalidSlugError, SlugConflictError } from "../utils/slug";

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
 * One implementation behind every typed Content router. `contractRouter` is
 * produced by the matching `makeDocumentContract(...)` call; this function
 * is the thin REST adapter over the shared document queries, parameterized by
 * the internal storage `kind` only.
 */
export function createDocumentsRouter<T extends Record<string, unknown>>(
    kind: DocumentKind,
    path: string,
    contractRouter: T,
) {
    const router = Router();
    router.use(path, requireAuth, requireTeam);

    const s = initServer();

    const prefix =
        kind === "blog"
            ? "content.articles"
            : kind === "doc"
              ? "content.documentation"
              : "content.productUpdates";
    const impl: any = authorizeHandlers(
        {
            create: async ({ body, req }: any) => {
                const doc = await createDocument(kind, {
                    teamId: req.teamId,
                    ...body,
                });
                return { status: 201, body: toPublicDocument(doc) };
            },
            list: async ({ query, req }: any) => {
                const teamId = req.teamId;
                const [items, total] = await Promise.all([
                    listDocuments(kind, {
                        teamId,
                        q: query.q,
                        offset: query.offset,
                        itemsPerPage: query.itemsPerPage,
                    }),
                    countDocuments(kind, { teamId, q: query.q }),
                ]);
                return {
                    status: 200,
                    body: {
                        items: items.map((item: any) => toPublicDocument(item)),
                        total,
                    },
                };
            },
            get: async ({ params, req }: any) => {
                const doc = await getDocumentByDocumentId(
                    kind,
                    params.documentId,
                );
                if (!doc || doc.teamId !== req.teamId)
                    return { status: 404, body: { error: "Not found" } };
                return { status: 200, body: toPublicDocument(doc) };
            },
            update: async ({ params, body, req }: any) => {
                try {
                    const doc = await updateDocument(
                        kind,
                        req.teamId,
                        params.documentId,
                        body,
                    );
                    if (!doc)
                        return { status: 404, body: { error: "Not found" } };
                    if (body.slug !== undefined) {
                        const team = await findTeamById(req.teamId);
                        if (team) revalidateTeam(team.teamId).catch(() => {});
                    }
                    return { status: 200, body: toPublicDocument(doc) };
                } catch (error) {
                    if (error instanceof InvalidSlugError) {
                        return { status: 400, body: { error: error.message } };
                    }
                    if (error instanceof SlugConflictError) {
                        return { status: 409, body: { error: error.message } };
                    }
                    throw error;
                }
            },
            publish: async ({ params, req }: any) => {
                const doc = await publishDocument(
                    kind,
                    req.teamId,
                    params.documentId,
                );
                if (!doc) return { status: 404, body: { error: "Not found" } };
                const team = await findTeamById(req.teamId);
                if (team) revalidateTeam(team.teamId).catch(() => {});
                return { status: 200, body: toPublicDocument(doc) };
            },
            discardDraft: async ({ params, req }: any) => {
                const doc = await discardDocumentDraft(
                    kind,
                    req.teamId,
                    params.documentId,
                );
                if (!doc) return { status: 404, body: { error: "Not found" } };
                return { status: 200, body: toPublicDocument(doc) };
            },
            remove: async ({ params, req }: any) => {
                const result = await deleteDocument(
                    kind,
                    req.teamId,
                    params.documentId,
                );
                if (!result.ok)
                    return { status: 404, body: { error: "Not found" } };
                const team = await findTeamById(req.teamId);
                if (team) revalidateTeam(team.teamId).catch(() => {});
                return { status: 204, body: undefined };
            },
        },
        {
            create: `${prefix}.create` as RestOperation,
            list: `${prefix}.list` as RestOperation,
            get: `${prefix}.get` as RestOperation,
            update: `${prefix}.update` as RestOperation,
            publish: `${prefix}.publish` as RestOperation,
            discardDraft: `${prefix}.discardDraft` as RestOperation,
            remove: `${prefix}.remove` as RestOperation,
        },
    );

    createExpressEndpoints(
        contractRouter as any,
        s.router(contractRouter as any, impl),
        router,
    );
    return router;
}
