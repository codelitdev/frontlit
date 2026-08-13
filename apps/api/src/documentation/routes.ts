import { Router } from "express";
import { createExpressEndpoints, initServer } from "@ts-rest/express";
import { contract } from "@frontlit/api-contract";
import { requireAuth } from "../auth/middleware";
import { requireTeam } from "../auth/require-team";
import { authorizeHandlers } from "../auth/authorize";
import {
    createDocSection,
    deleteDocSection,
    listDocSections,
    searchChunks,
    updateDocSection,
} from "./queries";
import { omitInternal, serializeDates } from "../utils/public";

/** Documentation sections (help-center nav tree) plus semantic search.
 * Mounted before the generic `/content/documentation/:documentId` router so
 * its literal section/search routes cannot be shadowed by the wildcard. */
const router = Router();
router.use("/content/documentation", requireAuth, requireTeam);

const s = initServer();

function toPublicSection<T extends Record<string, unknown>>(section: T) {
    return serializeDates(omitInternal(section, "teamId"));
}

const impl = s.router(
    contract.content.documentationSections,
    authorizeHandlers(
        {
            create: async ({ body, req }) => {
                const section = await createDocSection({
                    teamId: (req as any).teamId,
                    ...body,
                });
                return { status: 201, body: toPublicSection(section) };
            },
            list: async ({ req }) => {
                const items = await listDocSections((req as any).teamId);
                return {
                    status: 200,
                    body: { items: items.map(toPublicSection) },
                };
            },
            update: async ({ params, body, req }) => {
                const section = await updateDocSection(
                    (req as any).teamId,
                    params.sectionId,
                    body,
                );
                if (!section)
                    return {
                        status: 404,
                        body: { error: "Section not found" },
                    };
                return { status: 200, body: toPublicSection(section) };
            },
            remove: async ({ params, req }) => {
                const result = await deleteDocSection(
                    (req as any).teamId,
                    params.sectionId,
                );
                if (!result.ok)
                    return {
                        status: 404,
                        body: { error: "Section not found" },
                    };
                return { status: 204, body: undefined };
            },
            search: async ({ query, req }) => {
                const results = await searchChunks(
                    (req as any).teamId,
                    query.q,
                    query.k,
                );
                return { status: 200, body: { items: results } };
            },
        },
        {
            create: "content.documentationSections.create",
            list: "content.documentationSections.list",
            update: "content.documentationSections.update",
            remove: "content.documentationSections.remove",
            search: "content.documentationSections.search",
        },
    ),
);

createExpressEndpoints(contract.content.documentationSections, impl, router);

export default router;
