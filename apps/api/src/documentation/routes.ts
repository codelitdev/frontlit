import { Router } from "express";
import { createExpressEndpoints, initServer } from "@ts-rest/express";
import { contract } from "@frontlit/api-contract";
import { requireAuth } from "../auth/middleware";
import { requireTeam } from "../auth/require-team";
import { createDocSection, deleteDocSection, listDocSections, searchChunks, updateDocSection } from "./queries";
import { omitInternal, serializeDates } from "../utils/public";

/** Doc sections (help-center nav tree) + semantic search (architecture.md
 * §5.1/§6.4). Mounted *before* the generic `/docs/:documentId` router in
 * index.ts \u2014 its literal `/docs/search` path would otherwise be shadowed
 * by that router's `:documentId` wildcard. */
const router = Router();
router.use(requireAuth);
router.use(requireTeam);

const s = initServer();

function toPublicSection<T extends Record<string, unknown>>(section: T) {
    return serializeDates(omitInternal(section, "teamId"));
}

const impl = s.router(contract.docSections, {
    create: async ({ body, req }) => {
        const section = await createDocSection({ teamId: (req as any).teamId, ...body });
        return { status: 201, body: toPublicSection(section) };
    },
    list: async ({ req }) => {
        const items = await listDocSections((req as any).teamId);
        return { status: 200, body: { items: items.map(toPublicSection) } };
    },
    update: async ({ params, body, req }) => {
        const section = await updateDocSection((req as any).teamId, params.sectionId, body);
        if (!section) return { status: 404, body: { error: "Section not found" } };
        return { status: 200, body: toPublicSection(section) };
    },
    remove: async ({ params, req }) => {
        const result = await deleteDocSection((req as any).teamId, params.sectionId);
        if (!result.ok) return { status: 404, body: { error: "Section not found" } };
        return { status: 204, body: undefined };
    },
    search: async ({ query, req }) => {
        const results = await searchChunks((req as any).teamId, query.q, query.k);
        return { status: 200, body: { items: results } };
    },
});

createExpressEndpoints(contract.docSections, impl, router);

export default router;
