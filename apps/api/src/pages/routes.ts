import { Router } from "express";
import { createExpressEndpoints, initServer } from "@ts-rest/express";
import { contract } from "@frontlit/api-contract";
import { requireAuth } from "../auth/middleware";
import { requireTeam } from "../auth/require-team";
import {
    countPages,
    createPage,
    deletePage,
    derivePageStatus,
    discardPageDraft,
    getPageByPageId,
    listPages,
    publishPage,
    updatePage,
} from "./queries";
import { omitInternal, serializeDates } from "../utils/public";
import { findTeamById } from "../team/queries";
import { revalidateTeam } from "../services/revalidate";

const router = Router();
router.use(requireAuth);
router.use(requireTeam);

const s = initServer();

function toPublicPage<T extends Record<string, unknown>>(page: T) {
    return serializeDates(omitInternal({ ...page, status: derivePageStatus(page as any) }, "teamId"));
}

/** Thin ts-rest adapter: every handler extracts `params`/`query`/`body`
 * (already validated against `@frontlit/api-contract`), delegates to the
 * framework-agnostic `./queries.ts` functions, and maps the result to
 * `{ status, body }`. No business logic lives here. */
const impl = s.router(contract.pages, {
    create: async ({ body, req }) => {
        const page = await createPage({ teamId: (req as any).teamId, ...body });
        return { status: 201, body: toPublicPage(page) };
    },
    list: async ({ query, req }) => {
        const teamId = (req as any).teamId;
        const [items, total] = await Promise.all([
            listPages({ teamId, type: query.type, q: query.q, offset: query.offset, itemsPerPage: query.itemsPerPage }),
            countPages({ teamId, type: query.type, q: query.q }),
        ]);
        return {
            status: 200,
            body: { items: items.map((item) => toPublicPage(item)), total },
        };
    },
    get: async ({ params, req }) => {
        const page = await getPageByPageId(params.pageId);
        if (!page || page.teamId !== (req as any).teamId) {
            return { status: 404, body: { error: "Page not found" } };
        }
        return { status: 200, body: toPublicPage(page) };
    },
    update: async ({ params, body, req }) => {
        const page = await updatePage((req as any).teamId, params.pageId, body);
        if (!page) return { status: 404, body: { error: "Page not found" } };
        return { status: 200, body: toPublicPage(page) };
    },
    publish: async ({ params, req }) => {
        const page = await publishPage((req as any).teamId, params.pageId);
        if (!page) return { status: 404, body: { error: "Page not found" } };
        const team = await findTeamById((req as any).teamId);
        if (team) revalidateTeam(team.teamId).catch(() => {});
        return { status: 200, body: toPublicPage(page) };
    },
    discardDraft: async ({ params, req }) => {
        const page = await discardPageDraft((req as any).teamId, params.pageId);
        if (!page) return { status: 404, body: { error: "Page not found" } };
        return { status: 200, body: toPublicPage(page) };
    },
    remove: async ({ params, req }) => {
        const result = await deletePage((req as any).teamId, params.pageId);
        if (!result.ok && result.reason === "not_found") return { status: 404, body: { error: "Page not found" } };
        if (!result.ok && result.reason === "not_deleteable") {
            return { status: 409, body: { error: "This is a standard page and can't be deleted." } };
        }
        const team = await findTeamById((req as any).teamId);
        if (team) revalidateTeam(team.teamId).catch(() => {});
        return { status: 204, body: undefined };
    },
});

createExpressEndpoints(contract.pages, impl, router);

export default router;
